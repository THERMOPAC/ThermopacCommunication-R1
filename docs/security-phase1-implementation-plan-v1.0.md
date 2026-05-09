# Security Enforcement — Phase 1 Implementation Plan
**THERMOPAC QMS**
**Version:** 1.0
**Date:** 2026-05-09
**Status:** Approved for implementation — plan document only
**Baseline reference:** `docs/security-enforcement-gap-closure-plan-v1.0.md`
**Non-negotiable:** `server/payroll-salary-core.ts` — ZERO changes

---

## Approved Scope

| Task | Layer | Risk |
|---|---|---|
| T1 — Fix flag name mismatch in `require-reauth.ts` | 5 | Low |
| T2 — Add `requireReauth` to attendance override PATCH route | 5 | Low |
| T3 — Add `requireReauth` to attendance override DELETE route | 5 | Low |
| T4 — Add `requireReauth` to regularisation approve route | 5 | Low |
| T5 — Insert missing `sensitive_action_policies` DB rows | 5 | None |
| T6 — Wire 2FA policy enforcement gate in `auth.ts` | 1 | Medium |
| T7 — Add Superuser exemption to device trust check in `auth.ts` | 2 | Low |
| T8 — Add role scope check to device trust in `auth.ts` | 2 | Low |
| T9 — Wire enforcement flag in `attendance-security-service.ts` | 4 | Low |

**Not in scope:**
- Layer 3 Application Access GPS/IP (no implementation exists — deferred)
- Layer 4 live enforcement enablement (`SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` stays `false`)
- Layer 6D monitoring engine
- Layer 7 Payroll Impact Review queue

---

## Pre-Implementation State (DB Snapshot)

```
SECURITY_REAUTH_ENABLED                    = true   ← currently controls require-reauth.ts
SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = false  ← must be set true BEFORE T1
SECURITY_2FA_POLICY_ENABLED                = false  ← stays false until Layer 1 rollout
SECURITY_DEVICE_TRUST_ENABLED              = false  ← stays false until Layer 2 rollout
SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED    = false  ← stays false — T9 wires, does not enable
```

---

## Execution Order (strictly sequential — each task has pre-conditions)

```
[DB] Set SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = true
  ↓
T1 — require-reauth.ts: rename flag reference
  ↓
T5 — DB: insert two new sensitive_action_policies rows
  ↓
T2 — admin-routes.ts: add requireReauth to PATCH override
T3 — admin-routes.ts: add requireReauth to DELETE override   (parallel with T2)
T4 — attendance-routes.ts: add requireReauth to regularisation approve  (parallel with T2)
  ↓
T6 — auth.ts: wire 2FA policy enforcement gate
  ↓
T7 — auth.ts: add Superuser exemption before device trust check
T8 — auth.ts: add role scope check before device trust check  (same edit block as T7)
  ↓
T9 — attendance-security-service.ts: wire enforcement flag (advisory-to-blocking logic)
```

---

## Task Specifications

---

### [DB-PRE] Pre-condition: Set `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = true`

**Must execute before T1. If this runs after T1, re-auth will be disabled in production.**

```sql
UPDATE epc_migration_feature_flags
SET enabled = true, updated_at = NOW()
WHERE flag_name = 'SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED';
```

**Verification:**
```sql
SELECT flag_name, enabled FROM epc_migration_feature_flags
WHERE flag_name IN ('SECURITY_REAUTH_ENABLED', 'SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED');
-- Expected: both = true
```

---

### T1 — Fix Flag Name Mismatch in `require-reauth.ts`

**File:** `server/middleware/require-reauth.ts`

**Problem:** Lines 55 and 103 read `'SECURITY_REAUTH_ENABLED'`. The enforcement page toggle saves to `'SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED'`. These are different DB rows — the UI toggle has zero effect on the middleware.

**Pre-condition:** [DB-PRE] must have run — `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED` must be `true` in DB before this change is deployed.

**Change — line 55:**
```typescript
// BEFORE:
if (!await isFeatureFlagEnabled('SECURITY_REAUTH_ENABLED')) return next();

// AFTER:
if (!await isFeatureFlagEnabled('SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED')) return next();
```

**Change — line 103:**
```typescript
// BEFORE:
if (!await isFeatureFlagEnabled('SECURITY_REAUTH_ENABLED')) return true;

// AFTER:
if (!await isFeatureFlagEnabled('SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED')) return true;
```

**No other changes to `require-reauth.ts`.**

**Rollback:** Revert both lines to `'SECURITY_REAUTH_ENABLED'` — takes effect on next request, no restart required.

**Verification:**
- Set `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = false` → `POST /api/payroll/run/start` should succeed without re-auth prompt
- Set `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = true` → `POST /api/payroll/run/start` should return `{ code: 'REAUTH_REQUIRED' }`
- The UI enforcement toggle now controls the actual middleware behaviour

---

### T5 — Insert Missing `sensitive_action_policies` DB Rows

**Must run before T2/T3/T4** so the middleware has policies to look up for the new action keys.

**File:** DB only

```sql
INSERT INTO sensitive_action_policies
  (action_key, challenge_type, timeout_minutes, is_active)
VALUES
  ('attendance.override_admin',         'any', 30, true),
  ('attendance.approve_regularisation', 'any', 30, true)
ON CONFLICT (action_key) DO NOTHING;
```

**Verification:**
```sql
SELECT action_key, challenge_type, timeout_minutes, is_active
FROM sensitive_action_policies
WHERE action_key IN ('attendance.override_admin', 'attendance.approve_regularisation');
-- Expected: 2 rows, is_active = true
```

---

### T2 — Add `requireReauth` to Attendance Override PATCH Route

**File:** `server/admin-routes.ts`
**Line:** 1734

`requireReauth` is already imported at line 45 — no import change needed.

**Change — route signature at line 1734:**
```typescript
// BEFORE:
router.patch('/attendance/records/:id/override', ensureAuthenticated, async (req: Request, res: Response) => {

// AFTER:
router.patch('/attendance/records/:id/override', ensureAuthenticated, requireReauth('attendance.override_admin'), async (req: Request, res: Response) => {
```

**Rollback:** Remove `requireReauth('attendance.override_admin')` from the route signature.

**Verification:**
- Unauthenticated request → 401 (unchanged)
- Authenticated request without re-auth token → 403 `{ code: 'REAUTH_REQUIRED', actionKey: 'attendance.override_admin' }`
- Authenticated request with valid re-auth token → override proceeds normally

---

### T3 — Add `requireReauth` to Attendance Override DELETE Route

**File:** `server/admin-routes.ts`
**Line:** 1856

**Change — route signature at line 1856:**
```typescript
// BEFORE:
router.delete('/attendance/records/:id/override', ensureAuthenticated, async (req: Request, res: Response) => {

// AFTER:
router.delete('/attendance/records/:id/override', ensureAuthenticated, requireReauth('attendance.override_admin'), async (req: Request, res: Response) => {
```

**Note:** Both PATCH and DELETE share the same `action_key` — a single re-auth token covers both for its 30-minute window.

**Rollback:** Remove `requireReauth('attendance.override_admin')` from the route signature.

**Verification:** Same as T2 — DELETE also returns REAUTH_REQUIRED without a valid token.

---

### T4 — Add `requireReauth` to Regularisation Approve Route

**File:** `server/attendance-routes.ts`
**Line:** 1267

**Import change required — add to imports block (line 7):**
```typescript
// BEFORE (line 7):
import { ensureAuthenticated } from './auth-middleware';

// AFTER:
import { ensureAuthenticated } from './auth-middleware';
import { requireReauth } from './middleware/require-reauth';
```

**Change — route signature at line 1267:**
```typescript
// BEFORE:
router.post('/regularization/:id/approve', ensureAuthenticated, async (req: Request, res: Response) => {

// AFTER:
router.post('/regularization/:id/approve', ensureAuthenticated, requireReauth('attendance.approve_regularisation'), async (req: Request, res: Response) => {
```

**Rollback:** Remove the import line and remove `requireReauth('attendance.approve_regularisation')` from the route.

**Verification:**
- Approve request without token → 403 `{ code: 'REAUTH_REQUIRED', actionKey: 'attendance.approve_regularisation' }`
- Approve request with valid token → regularisation approved normally

---

### T6 — Wire 2FA Policy Enforcement Gate in `auth.ts`

**File:** `server/auth.ts`

**Problem:** The login flow in `auth.ts` issues a TOTP challenge when `user.twoFactorEnabled = true`, but never reads `two_fa_global_policy` to block users who are in scope and have NOT enrolled.

**Import additions needed — `server/auth.ts` top import block:**
```typescript
// Add to the existing schema import line (line 8):
// BEFORE:
import { User as SelectUser, passwordChangeSchema, users, twoFactorAuditLog, loginAuditLog } from "@shared/schema";

// AFTER:
import { User as SelectUser, passwordChangeSchema, users, twoFactorAuditLog, loginAuditLog, twoFaGlobalPolicy } from "@shared/schema";
```

**Logic to insert — position: after lockout check block, before existing `if (user.twoFactorEnabled)` block.**

Current flow at this point:
```
Step B — lockout check
↓
[INSERT NEW BLOCK HERE — Step B2]
↓
if (user.twoFactorEnabled) { issue challenge }   ← existing, keep unchanged
↓
req.login(...) { device trust → success audit }
```

**New block (Step B2) to insert:**
```typescript
// Step B2 — 2FA policy enforcement gate
// Blocks users who are in scope but have not enrolled TOTP.
// Only runs when SECURITY_2FA_POLICY_ENABLED = true.
// Superuser is always exempt.
if (await isFeatureFlagEnabled('SECURITY_2FA_POLICY_ENABLED')) {
  if (user.role !== 'Superuser') {
    try {
      const [policy] = await db.select().from(twoFaGlobalPolicy).limit(1);
      if (policy) {
        const roles: string[] = policy.applyToRoles ?? [];
        const inScope = roles.length > 0 && roles.includes(user.role);
        if (inScope) {
          const enforceNow =
            policy.enforcementMode === 'required_immediately' ||
            (policy.enforcementMode === 'required_from_date' &&
              policy.enforcementFromDate !== null &&
              new Date() >= new Date(policy.enforcementFromDate));
          if (enforceNow && !user.twoFactorEnabled) {
            if (await isFeatureFlagEnabled('SECURITY_LOGIN_AUDIT_ENABLED')) {
              await db.insert(loginAuditLog).values({
                userId: user.id,
                username: user.username,
                ipAddress: ip,
                userAgent,
                outcome: 'blocked_no_totp',
                policyLevel: 'standard',
                severity: 'warning',
              });
            }
            return res.status(403).json({
              code: 'TOTP_SETUP_REQUIRED',
              message: 'Two-factor authentication is required for your role. Please set up your authenticator app.',
            });
          }
        }
      }
    } catch (twoFaPolicyErr) {
      console.error('2FA policy read error (C-10):', twoFaPolicyErr);
      return res.status(500).json({ message: 'Security service error' });
    }
  }
}
```

**Behaviour table:**

| `SECURITY_2FA_POLICY_ENABLED` | `user.role` | `applyToRoles` | `twoFactorEnabled` | `enforcementMode` | Result |
|---|---|---|---|---|---|
| false | any | any | any | any | Pass through (unchanged) |
| true | Superuser | any | any | any | Pass through (exempt) |
| true | Employee | `[]` (empty) | false | required_immediately | Pass through (no roles in scope) |
| true | Employee | `['Employee']` | false | required_immediately | **403 TOTP_SETUP_REQUIRED** |
| true | Employee | `['Employee']` | true | required_immediately | TOTP challenge (existing flow) |
| true | Employee | `['Employee']` | false | required_from_date (future date) | Pass through |
| true | Employee | `['Employee']` | false | required_from_date (past date) | **403 TOTP_SETUP_REQUIRED** |
| true | Employee | `['Employee']` | false | optional | Pass through |

**No changes to the existing `if (user.twoFactorEnabled)` block.**

**Rollback:** Set `SECURITY_2FA_POLICY_ENABLED = false` in DB → gate is skipped on next login. No code rollback needed for emergency.

**Verification:**
- `SECURITY_2FA_POLICY_ENABLED = false` → unenrolled Employee logs in normally
- `SECURITY_2FA_POLICY_ENABLED = true`, `applyToRoles = []` → unenrolled Employee logs in
- `SECURITY_2FA_POLICY_ENABLED = true`, role in scope, mode = `optional` → unenrolled Employee logs in
- `SECURITY_2FA_POLICY_ENABLED = true`, role in scope, mode = `required_immediately`, `twoFactorEnabled = false` → 403 + `TOTP_SETUP_REQUIRED`
- `SECURITY_2FA_POLICY_ENABLED = true`, role in scope, `twoFactorEnabled = true` → TOTP challenge (existing behaviour)
- Superuser, all of the above → always logs in (exempt)
- DB error during policy read → 500, not a silent pass-through

---

### T7 + T8 — Superuser Exemption and Role Scope for Device Trust in `auth.ts`

**File:** `server/auth.ts`
**Position:** Inside the `req.login()` callback, at the existing `if (await isFeatureFlagEnabled('SECURITY_DEVICE_TRUST_ENABLED'))` block (currently line 374).

**Current code:**
```typescript
if (await isFeatureFlagEnabled('SECURITY_DEVICE_TRUST_ENABLED')) {
  try {
    const trustResult = await checkDeviceTrustAtLogin(req, user.id, user.role);
    if (!trustResult.trusted) {
      await new Promise<void>(resolve => req.logout(() => resolve()));
      return res.status(401).json({
        code: 'DEVICE_NOT_TRUSTED',
        message: trustResult.reason === 'NO_COOKIE'
          ? 'Access from an unregistered device. Contact your Superuser.'
          : 'Device trust token is invalid or has been revoked.',
      });
    }
    isTrustedDevice = true;
    req.session.deviceTrusted = true;
    if (trustResult.deviceId) {
      req.session.deviceFingerprint = String(trustResult.deviceId);
    }
  } catch (deviceErr) {
    console.error('Device trust check failed (C-10):', deviceErr);
    await new Promise<void>(resolve => req.logout(() => resolve()));
    return res.status(500).json({ message: 'Security service error' });
  }
}
```

**Replacement — add Superuser exemption (T7) and role scope guard (T8):**
```typescript
if (await isFeatureFlagEnabled('SECURITY_DEVICE_TRUST_ENABLED')) {
  // T7: Superuser is always exempt from device trust enforcement
  const isDeviceTrustExempt = user.role === 'Superuser';

  if (!isDeviceTrustExempt) {
    // T8: Role scope guard — only enforce for roles listed in two_fa_global_policy.apply_to_roles
    // (The enforcement-scope page stores the global apply_to_roles there)
    let roleInDeviceScope = true; // default: enforce for all roles
    try {
      const [scopePolicy] = await db.select({ applyToRoles: twoFaGlobalPolicy.applyToRoles })
        .from(twoFaGlobalPolicy).limit(1);
      if (scopePolicy) {
        const scopeRoles: string[] = scopePolicy.applyToRoles ?? [];
        // Empty array means no scope configured — enforce for all roles
        if (scopeRoles.length > 0) {
          roleInDeviceScope = scopeRoles.includes(user.role);
        }
      }
    } catch (scopeErr) {
      console.error('Device trust scope read error (C-10):', scopeErr);
      await new Promise<void>(resolve => req.logout(() => resolve()));
      return res.status(500).json({ message: 'Security service error' });
    }

    if (roleInDeviceScope) {
      try {
        const trustResult = await checkDeviceTrustAtLogin(req, user.id, user.role);
        if (!trustResult.trusted) {
          await new Promise<void>(resolve => req.logout(() => resolve()));
          return res.status(401).json({
            code: 'DEVICE_NOT_TRUSTED',
            message: trustResult.reason === 'NO_COOKIE'
              ? 'Access from an unregistered device. Contact your Superuser.'
              : 'Device trust token is invalid or has been revoked.',
          });
        }
        isTrustedDevice = true;
        req.session.deviceTrusted = true;
        if (trustResult.deviceId) {
          req.session.deviceFingerprint = String(trustResult.deviceId);
        }
      } catch (deviceErr) {
        console.error('Device trust check failed (C-10):', deviceErr);
        await new Promise<void>(resolve => req.logout(() => resolve()));
        return res.status(500).json({ message: 'Security service error' });
      }
    }
  }
}
```

**Note:** `twoFaGlobalPolicy` was already imported in T6 — no additional import needed here.

**Behaviour table:**

| Flag | `user.role` | `applyToRoles` | Device registered? | Result |
|---|---|---|---|---|
| false | any | any | any | Pass through (flag off) |
| true | Superuser | any | any | Pass through (exempt) |
| true | Employee | `[]` (empty) | unregistered | Blocked (all roles in scope when list is empty) |
| true | Employee | `['Employee']` | unregistered | Blocked |
| true | Manager | `['Employee']` | unregistered | Pass through (Manager not in scope) |
| true | Employee | `['Employee']` | registered | Pass through |

**Rollback:** Set `SECURITY_DEVICE_TRUST_ENABLED = false` → device check skipped entirely. Flag already `false` in prod.

**Verification:**
- Flag false → any device passes
- Flag true, Superuser, unregistered device → login succeeds
- Flag true, Employee in scope, unregistered → 401 DEVICE_NOT_TRUSTED
- Flag true, Manager NOT in scope list → login succeeds (Manager skips device check)
- Flag true, Employee in scope, registered device → login succeeds
- DB error reading scope policy → 500, not silent pass-through

---

### T9 — Wire Enforcement Flag in `attendance-security-service.ts`

**File:** `server/attendance-security-service.ts`

**Problem:** Step 8 (outcome determination) hardcodes `blocked: false` in every path. `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` is referenced only in comments — never read at runtime. The flag has no effect.

**Pre-condition:** `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` **stays `false`** in DB. This task wires the logic so that when the flag IS eventually enabled, enforcement activates. No behaviour change in current prod state.

**Change — add flag read at the top of the `runAttendanceAuditPipeline` function:**

Currently the function reads `SECURITY_ATTENDANCE_AUDIT_ENABLED` at approximately line 189. Add the enforcement flag read immediately after:

```typescript
// BEFORE (existing, keep):
const flagEnabled = await isFeatureFlagEnabled('SECURITY_ATTENDANCE_AUDIT_ENABLED');

// AFTER (add the line below it):
const flagEnabled = await isFeatureFlagEnabled('SECURITY_ATTENDANCE_AUDIT_ENABLED');
const enforcing  = await isFeatureFlagEnabled('SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED');
```

**Change — Step 8 outcome determination block:**

```typescript
// BEFORE:
// Step 8: Outcome determination (advisory — never blocks)
let outcome: string;
let severity: string;

if (spoofingFlags.length > 0) {
  outcome = 'advisory_spoofing_detected';
  severity = 'warning';
} else if (!inGeofence) {
  outcome = 'advisory_outside_geofence';
  severity = 'warning';
} else if (!gpsAccuracyOk) {
  outcome = 'advisory_low_accuracy';
  severity = 'warning';
} else if (policy.requireIpVerification && !isIpVerified) {
  outcome = 'advisory_ip_unverified';
  severity = 'warning';
} else {
  outcome = 'advisory_ok';
  severity = 'info';
}

// ... (writeAuditRow) ...

return {
  auditId, policyMode, outcome,
  distanceToOfficeMeters, spoofingFlags,
  gpsStatus, severity, blocked: false,
};


// AFTER:
// Step 8: Outcome determination
// Advisory mode (enforcing = false): all outcomes pass, blocked always false
// Enforced mode (enforcing = true): spoofing/geofence/IP violations block check-in
let outcome: string;
let severity: string;

if (spoofingFlags.length > 0) {
  outcome = 'advisory_spoofing_detected';
  severity = 'warning';
} else if (!inGeofence) {
  outcome = 'advisory_outside_geofence';
  severity = 'warning';
} else if (!gpsAccuracyOk) {
  // Low accuracy is never a block condition — only advisory
  outcome = 'advisory_low_accuracy';
  severity = 'warning';
} else if (policy.requireIpVerification && !isIpVerified) {
  outcome = 'advisory_ip_unverified';
  severity = 'warning';
} else {
  outcome = 'advisory_ok';
  severity = 'info';
}

// Enforcement decision: low_accuracy and advisory_ok are never blocked
const BLOCKING_OUTCOMES = new Set([
  'advisory_spoofing_detected',
  'advisory_outside_geofence',
  'advisory_ip_unverified',
]);
const blocked = enforcing && BLOCKING_OUTCOMES.has(outcome);

// ... (writeAuditRow — unchanged) ...

return {
  auditId, policyMode, outcome,
  distanceToOfficeMeters, spoofingFlags,
  gpsStatus, severity, blocked,
};
```

**Also update the return type interface** (at approximately line 47) to allow `blocked: boolean` (not `blocked: false`):
```typescript
// BEFORE:
  blocked: false;

// AFTER:
  blocked: boolean;
```

**Behaviour table:**

| `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` | Outcome | `blocked` |
|---|---|---|
| false | any | `false` (current advisory behaviour — unchanged) |
| true | `advisory_ok` | `false` |
| true | `advisory_low_accuracy` | `false` |
| true | `advisory_spoofing_detected` | `true` |
| true | `advisory_outside_geofence` | `true` |
| true | `advisory_ip_unverified` | `true` |

**Important:** The attendance route that calls `runAttendanceAuditPipeline` must already handle `blocked: true` — confirm `server/attendance-routes.ts` checks `securityResult.blocked` and returns 403 if true. If not, that becomes a T9-follow-up before enforcement is ever enabled. **T9 itself is safe at current flag value (`false`) regardless.**

**Rollback:** Setting `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = false` restores advisory-only behaviour. Code rollback reverts the `enforcing` variable and restores `blocked: false` literals.

**Verification (with flag still false):**
- Any check-in → audit row written, `blocked = false` — identical to pre-T9 behaviour

**Verification (with flag temporarily set true for testing, then reverted):**
- Check-in from inside geofence, good GPS → `outcome = advisory_ok`, `blocked = false`
- Check-in from outside geofence → `outcome = advisory_outside_geofence`, `blocked = true`
- Check-in with spoofing flags → `outcome = advisory_spoofing_detected`, `blocked = true`
- Check-in with low accuracy only → `outcome = advisory_low_accuracy`, `blocked = false`

---

## Rollback Plan (Full Phase 1)

If Phase 1 must be fully reverted, execute in reverse order:

| Step | Action | Effect |
|---|---|---|
| 1 | Revert `attendance-security-service.ts` → restore `blocked: false` literals | T9 reverted |
| 2 | Revert device trust block in `auth.ts` → original 6-line block | T7+T8 reverted |
| 3 | Remove Step B2 block from `auth.ts`, remove `twoFaGlobalPolicy` import | T6 reverted |
| 4 | Remove `requireReauth` from regularisation approve route, remove import | T4 reverted |
| 5 | Remove `requireReauth` from override DELETE route | T3 reverted |
| 6 | Remove `requireReauth` from override PATCH route | T2 reverted |
| 7 | `DELETE FROM sensitive_action_policies WHERE action_key IN ('attendance.override_admin','attendance.approve_regularisation')` | T5 reverted |
| 8 | Revert `require-reauth.ts` lines 55 + 103 → `'SECURITY_REAUTH_ENABLED'` | T1 reverted |
| 9 | `UPDATE epc_migration_feature_flags SET enabled = false WHERE flag_name = 'SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED'` | DB-PRE reverted |

Emergency fast-path (maintains re-auth behaviour, disables UI toggle control):
- Revert only T1 → flag reverts to `SECURITY_REAUTH_ENABLED` (still `true`) → re-auth stays active

---

## Verification Test Suite (Phase 1 Complete)

### Layer 5 — Re-Auth

| # | Test | Expected |
|---|---|---|
| 5.1 | Set `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = false` → call `POST /api/payroll/run/start` | 200 OK (no re-auth) |
| 5.2 | Set flag `true` → call without re-auth token | 403 `REAUTH_REQUIRED` |
| 5.3 | Set flag `true` → call with valid token | Proceeds normally |
| 5.4 | `PATCH /api/admin/attendance/records/1/override` without token | 403 `REAUTH_REQUIRED`, actionKey = `attendance.override_admin` |
| 5.5 | `DELETE /api/admin/attendance/records/1/override` without token | 403 `REAUTH_REQUIRED`, actionKey = `attendance.override_admin` |
| 5.6 | `POST /api/attendance/regularization/1/approve` without token | 403 `REAUTH_REQUIRED`, actionKey = `attendance.approve_regularisation` |
| 5.7 | All of the above with valid token | Proceed normally |
| 5.8 | UI toggle OFF → confirm flag = false in DB | Flag changes, middleware re-auth skipped |
| 5.9 | UI toggle ON → confirm flag = true | Middleware re-auth enforced |

### Layer 1 — 2FA Policy Gate

| # | Test | Expected |
|---|---|---|
| 1.1 | `SECURITY_2FA_POLICY_ENABLED = false`, any user → login | Pass through (current behaviour) |
| 1.2 | Flag `true`, `applyToRoles = []` → unenrolled Employee login | Pass through (no scope) |
| 1.3 | Flag `true`, roles `['Employee']`, mode `optional` → unenrolled Employee | Pass through |
| 1.4 | Flag `true`, roles `['Employee']`, mode `required_immediately` → unenrolled Employee | 403 `TOTP_SETUP_REQUIRED` |
| 1.5 | Same as 1.4 but `twoFactorEnabled = true` | TOTP challenge (existing) |
| 1.6 | Flag `true`, roles `['Employee']`, mode `required_from_date`, date = tomorrow → unenrolled | Pass through |
| 1.7 | Same as 1.6, date = yesterday | 403 `TOTP_SETUP_REQUIRED` |
| 1.8 | Superuser, flag `true`, all roles in scope, mode `required_immediately`, unenrolled | Login succeeds (exempt) |
| 1.9 | DB error reading policy → response | 500 (not silent pass-through) |
| 1.10 | `login_audit_log` row written with `outcome = 'blocked_no_totp'` on block | Row present |

### Layer 2 — Device Trust Scope + Superuser Exemption

| # | Test | Expected |
|---|---|---|
| 2.1 | `SECURITY_DEVICE_TRUST_ENABLED = false` → any device | Pass through |
| 2.2 | Flag `true`, Superuser, unregistered device → login | Succeeds (exempt) |
| 2.3 | Flag `true`, Employee in `applyToRoles`, unregistered device | 401 `DEVICE_NOT_TRUSTED` |
| 2.4 | Flag `true`, Manager NOT in `applyToRoles ['Employee']` → unregistered | Login succeeds |
| 2.5 | Flag `true`, `applyToRoles = []`, unregistered Employee | 401 (all roles in scope when list empty) |
| 2.6 | Flag `true`, Employee in scope, registered device | Login succeeds |

### Layer 4 — Enforcement Wiring (flag stays false — test wiring only)

| # | Test | Expected |
|---|---|---|
| 4.1 | Flag `false`, check-in outside geofence | `blocked = false`, check-in succeeds (advisory) |
| 4.2 | Temporarily set flag `true`, check-in with `advisory_ok` | `blocked = false` |
| 4.3 | Flag `true`, spoofing detected | `blocked = true` |
| 4.4 | Flag `true`, outside geofence | `blocked = true` |
| 4.5 | Flag `true`, low accuracy only | `blocked = false` |
| 4.6 | Revert flag to `false` after T9 tests | All check-ins proceed (advisory restored) |

---

## Files Modified in Phase 1

| File | Tasks | Change Type |
|---|---|---|
| `server/middleware/require-reauth.ts` | T1 | 2 string replacements |
| `server/admin-routes.ts` | T2, T3 | 2 route signature additions |
| `server/attendance-routes.ts` | T4 | 1 import + 1 route signature addition |
| `server/auth.ts` | T6, T7, T8 | 1 import addition + 2 new logic blocks |
| `server/attendance-security-service.ts` | T9 | 1 variable addition + 1 return type change + Step 8 refactor |
| DB only | DB-PRE, T5 | 1 UPDATE + 1 INSERT |

**Files NOT touched:**
- `server/payroll-salary-core.ts` — zero changes (non-negotiable)
- `server/payroll-routes.ts` — no changes (existing re-auth gates are already correct)
- All frontend files — no UI changes in Phase 1
- `shared/schema.ts` — no schema changes
- `drizzle.config.ts` — forbidden

---

## Document Control

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 2026-05-09 |
| Baseline | `docs/security-enforcement-gap-closure-plan-v1.0.md` |
| Status | Approved for implementation |
| Next | Phase 2 — Enable Layer 2 (after device pre-registration) |
