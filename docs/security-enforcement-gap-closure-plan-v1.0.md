# Security Enforcement Gap Closure Plan — v1.0
**THERMOPAC QMS — Two-Plane Security Architecture**
**Date:** 2026-05-09
**Scope:** All 7 Security Enforcement Layers (Layers 1–7) + Cross-Layer Governance
**Status:** Plan only — no implementation
**Non-negotiable constraints:**
- `server/payroll-salary-core.ts` — ZERO changes
- Payroll remains attendance-status SSoT
- Separation maintained: Application Access | Attendance Enforcement | Payroll Review

---

## Table of Contents
1. [Architecture Separation Rules](#architecture-separation-rules)
2. [Toggle Status Summary](#toggle-status-summary)
3. [Layer 1 — 2FA Enforcement](#layer-1--2fa-enforcement)
4. [Layer 2 — Trusted Device Enforcement](#layer-2--trusted-device-enforcement)
5. [Layer 3 — Application Access GPS/IP Enforcement](#layer-3--application-access-gpsip-enforcement)
6. [Layer 4 — Attendance GPS/IP Enforcement](#layer-4--attendance-gpsip-enforcement)
7. [Layer 5 — Attendance & Payroll Re-Authentication](#layer-5--attendance--payroll-re-authentication)
8. [Layer 6 — Security Audit Logging](#layer-6--security-audit-logging)
9. [Layer 7 — Payroll Impact Review](#layer-7--payroll-impact-review)
10. [Cross-Layer Dependencies](#cross-layer-dependencies)
11. [Rollout Sequence](#rollout-sequence)
12. [Zero-Trust Audit Plan](#zero-trust-audit-plan)

---

## Architecture Separation Rules

These boundaries are non-negotiable and must be maintained through every implementation task.

| Plane | Scope | Does NOT touch |
|---|---|---|
| **Plane A — Application Access** | Layers 1, 2, 3 — govern whether a user can log in and use the app | Attendance records, payroll |
| **Plane B — Attendance Enforcement** | Layers 4, 5 — govern check-in validity and payroll-sensitive action gates | Login, device trust |
| **Plane C — Payroll Logic** | `payroll-salary-core.ts` only — arithmetic, LWP, deductions | Everything above |
| **Cross-Plane** | Layers 6, 7 — audit and review governance | Direct enforcement |

---

## Toggle Status Summary

### Feature Flags (DB: `epc_migration_feature_flags`)

| Flag | Current DB Value | Toggle Functional? | Enforcement Live? |
|---|---|---|---|
| `SECURITY_2FA_POLICY_ENABLED` | false | Saves only | No |
| `SECURITY_DEVICE_TRUST_ENABLED` | false | ✅ Live gate | Yes (when true) |
| `SECURITY_APP_ACCESS_ENFORCEMENT_ENABLED` | false | Saves only | No |
| `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` | false | Saves only | No |
| `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED` | false | ❌ Wrong flag name | No |
| `SECURITY_REAUTH_ENABLED` | **true** | ✅ Live gate (always-on) | Yes |
| `SECURITY_LOGIN_AUDIT_ENABLED` | **true** | Always-on | ✅ Yes |
| `SECURITY_ATTENDANCE_AUDIT_ENABLED` | **true** | Always-on | ✅ Yes |
| `SECURITY_ARCHIVAL_ENABLED` | false | Saves only | No |
| `SECURITY_MONITORING_ENABLED` | false | Saves only | No |
| `SECURITY_PAYROLL_IMPACT_REVIEW_ENABLED` | false | Saves only | No |

### Sensitive Action Policies (DB: `sensitive_action_policies`)

All 15 policies are active. The middleware reads `SECURITY_REAUTH_ENABLED` (currently true) to decide whether to enforce them.

---

## Layer 1 — 2FA Enforcement

### Current Implementation Status
- **Status:** Partially implemented
- TOTP setup/verify/disable routes exist (`server/two-factor-routes.ts`, `server/admin-2fa-routes.ts`)
- `two_fa_global_policy` table exists and is writeable via the enforcement UI
- DB state: `enforcement_mode = 'optional'`, `apply_to_roles = []`, `grace_period_enabled = false`
- `auth.ts` issues TOTP challenges only when a user has TOTP already enrolled
- `auth.ts` **never reads** `two_fa_global_policy` — the policy has zero effect on login

### Missing Backend Logic

**A. Login gate in `auth.ts`**
After successful password authentication, before issuing the session, `auth.ts` must:
1. Read `SECURITY_2FA_POLICY_ENABLED` from `epc_migration_feature_flags`
2. If disabled → pass through unchanged (current behaviour preserved)
3. If enabled → read `two_fa_global_policy`: `enforcement_mode`, `apply_to_roles`, `enforcement_from_date`
4. Check if `user.role` is in `apply_to_roles` (empty array = no roles = no enforcement)
5. If in scope and `enforcement_mode = 'required_immediately'`:
   - If user has TOTP enrolled → issue challenge (already works)
   - If user has NOT enrolled → return `{ code: 'TOTP_SETUP_REQUIRED', redirectTo: '/setup-totp' }` with HTTP 403
6. If in scope and `enforcement_mode = 'required_from_date'`:
   - Check `enforcement_from_date` against current IST date
   - Before the date: pass through (optional TOTP if enrolled)
   - On/after the date: apply same logic as `required_immediately`
7. Superuser exemption: Superuser role is never blocked regardless of policy (can always log in)

**B. Session protection**
A middleware must re-check TOTP status on every authenticated request when the flag is enabled, to prevent session-persist attacks where a user logs in before enforcement was activated.

### Missing UI Logic
- The enforcement page UI is complete
- A "who will be affected" preview is needed: when roles are selected + mode is set, show a count of active users in those roles who do not yet have TOTP enrolled (query `/api/admin/users` and cross-reference `totp_enabled`)

### Missing Schema / Tables / Flags
- No new tables required — `two_fa_global_policy` and `two_fa_policy_audit_log` already exist
- New flag: None required — `SECURITY_2FA_POLICY_ENABLED` already in DB

### Feature Flag Behaviour
| Flag state | Runtime behaviour |
|---|---|
| `false` | `auth.ts` skips policy check entirely — optional TOTP (current) |
| `true` | Policy read on every login, enforcement by role and date |

### Enforcement vs Advisory
- There is no advisory mode for Layer 1 — it is binary: optional or enforced
- When enforced, unenrolled in-scope users are blocked at login with a clear setup redirect

### Superuser Exemption
- Superuser is always exempt from 2FA enforcement blocking
- Superuser can still voluntarily enrol TOTP
- Exemption is role-based — checked at the gate, no override flag needed

### Emergency Disable
- Set `SECURITY_2FA_POLICY_ENABLED = false` in `epc_migration_feature_flags`
- Takes effect on next login attempt — no restart required
- Existing sessions are not terminated
- Audit log entry must be written when emergency disable is triggered

### Rollout Strategy
1. Pre-rollout: run the "affected users" count query — confirm all target roles have enrolled
2. Set `enforcement_mode = 'required_from_date'`, set date 7 days out, `apply_to_roles = ['Employee', 'Manager']`
3. Notify affected users to enrol within 7 days
4. Set `SECURITY_2FA_POLICY_ENABLED = true` immediately — begins counting down, not blocking
5. On enforcement date, all unenrolled in-scope users are blocked at login
6. Expand to `Senior Manager`, `General Manager` in next cycle

### Rollback Strategy
1. Set `SECURITY_2FA_POLICY_ENABLED = false` → immediate pass-through restored
2. Or narrow `apply_to_roles = []` → policy loads but no roles are in scope (no-op enforcement)
3. Both options take effect on the next login — no restart, no session disruption

### Operational Risks
- Users in enforcement scope who lose their authenticator device are locked out — TOTP reset flow (`user.reset_2fa` policy, challenge = `any`, timeout = 0) must be tested before enabling enforcement
- Superuser must be able to reset any user's TOTP while locked out — confirm reset route does not itself require TOTP

### Verification Tests
- [ ] Flag = false → login with unenrolled user succeeds
- [ ] Flag = true, mode = required_immediately, role in scope, user unenrolled → 403 + TOTP_SETUP_REQUIRED
- [ ] Flag = true, mode = required_immediately, role in scope, user enrolled → TOTP challenge issued
- [ ] Flag = true, mode = required_from_date, date future → enrolled user passes, unenrolled user passes
- [ ] Flag = true, mode = required_from_date, date past → unenrolled blocked
- [ ] Superuser unenrolled + flag true + all roles in scope → login succeeds (exemption)
- [ ] Emergency disable: set flag false → unenrolled in-scope user logs in on next attempt

---

## Layer 2 — Trusted Device Enforcement

### Current Implementation Status
- **Status: Fully implemented**
- `server/trusted-device-service.ts` — complete device trust check, fingerprint match, cookie validation
- `server/admin-device-routes.ts` — device management (list, grant, revoke)
- `server/security-device-routes.ts` — user-facing trust registration
- `auth.ts` line 374: reads `SECURITY_DEVICE_TRUST_ENABLED`, calls `checkDeviceTrustAtLogin()`, blocks with 403 on unrecognised device
- Flag is currently `false` — one flag flip away from live enforcement

### Missing Backend Logic
- None architecturally
- **Gap 1:** The `apply_to_roles` global scope from the enforcement page is not consumed by `checkDeviceTrustAtLogin()` — device trust currently applies to ALL roles when enabled. The service needs to check whether the user's role is in the global `apply_to_roles` scope before blocking.
- **Gap 2:** Superuser exemption is not explicitly handled in `trusted-device-service.ts` — verify the Superuser bypass exists or add a role check before the block

### Missing UI Logic
- The device management panel exists
- A "first-time device registration" user flow should be confirmed — a user blocked at login on an unregistered device needs a clear path to contact the Superuser, not just a 403

### Missing Schema / Tables / Flags
- No new tables required
- No new flags required

### Feature Flag Behaviour
| Flag state | Runtime behaviour |
|---|---|
| `false` | `checkDeviceTrustAtLogin()` not called — all devices pass |
| `true` | Every login validates device fingerprint against `trusted_devices` table |

### Superuser Exemption
- Superuser must bypass device trust enforcement — add explicit `if (user.role === 'Superuser') return next()` before the device check in `auth.ts`, or add the role check inside `checkDeviceTrustAtLogin()`

### Emergency Disable
- Set `SECURITY_DEVICE_TRUST_ENABLED = false` → takes effect on next login
- No session disruption

### Rollout Strategy
1. Pre-register all Superuser and GM devices first (via `security.grant_device_trust` TOTP-gated action)
2. Enable for `Superuser`, `General Manager` only (via `apply_to_roles`) — validate
3. Expand incrementally to remaining roles
4. Set `SECURITY_DEVICE_TRUST_ENABLED = true`

### Rollback Strategy
- Set flag to `false` → all logins pass immediately

### Verification Tests
- [ ] Flag false → unregistered device logs in successfully
- [ ] Flag true → registered device logs in successfully
- [ ] Flag true → unregistered device blocked with 403
- [ ] Flag true → Superuser on unregistered device logs in (exemption)
- [ ] `apply_to_roles = ['Employee']` → Manager on unregistered device passes, Employee blocked

---

## Layer 3 — Application Access GPS/IP Enforcement

### Current Implementation Status
- **Status: UI only — no backend implementation**
- Feature flag `SECURITY_APP_ACCESS_ENFORCEMENT_ENABLED` exists in DB
- Flag is stored and read by `admin-security-enforcement-routes.ts`
- No middleware, no route gate, no login-time GPS/IP check exists anywhere in the codebase
- The only IP-restriction code in the codebase is in `attendance-routes.ts` (for check-in, not login)

### Missing Backend Logic

**A. Login-time IP check middleware**
A new function (or extension to `auth.ts`) must:
1. Read `SECURITY_APP_ACCESS_ENFORCEMENT_ENABLED`
2. If enabled: extract the originating IP from `x-forwarded-for` or `req.socket.remoteAddress`
3. Look up the user's assigned work location(s) from `employee_profiles` → `work_location_id` → `work_locations.ipRestrictions`
4. If `ipRestrictions` is non-empty and IP does not match any entry → return `{ code: 'IP_ACCESS_DENIED' }` 403
5. If `ipRestrictions` is empty for the user's location → pass through (no restriction configured)
6. Superuser exemption: always pass through

**B. GPS check (browser-reported)**
GPS enforcement at login is harder than attendance (no browser geolocation is triggered at login). Three options:
- **Option A (recommended):** IP-only enforcement at login (Layer 3 = IP only). GPS enforcement stays in Layer 4 (attendance). Clear separation.
- **Option B:** Require a one-time GPS confirmation page after successful password auth but before session issuance. Adds friction.
- **Option C:** Advisory-only — log GPS at login but do not block.

The recommended architecture is Option A: Layer 3 = IP enforcement at login, Layer 4 = GPS enforcement at attendance check-in. This maintains clear plane separation.

**C. `work_locations` table audit**
Confirm `work_locations.ipRestrictions` column is populated for all locations where enforcement is desired. Currently IP data is entered per location — verify completeness before enabling.

### Missing Schema / Tables / Flags
- No new tables required
- `work_locations.ipRestrictions` already exists (text array)
- Consider adding a `work_locations.enforce_ip_on_login` boolean per location to allow per-location control, rather than a global all-or-nothing flag

### Feature Flag Behaviour
| Flag state | Runtime behaviour |
|---|---|
| `false` | No IP check at login — all IPs pass |
| `true` | Login IP validated against user's work location `ipRestrictions` |

### Advisory vs Enforced
- Layer 3 has no advisory mode — it is an application access gate
- Before enabling, run the check in "log only" mode for 2–3 days to confirm the IP list is accurate, then switch to blocking

### Superuser Exemption
- Superuser always passes Layer 3 — no IP restriction applies

### Emergency Disable
- Set `SECURITY_APP_ACCESS_ENFORCEMENT_ENABLED = false` → immediate pass-through restored

### Rollout Strategy
1. Populate `work_locations.ipRestrictions` for all offices
2. Run in log-only mode for 1 week — confirm no false positives
3. Enable for one role only (e.g., `Employee`)
4. Monitor for 1 week, review login audit log
5. Expand to remaining roles

### Rollback Strategy
- Set flag to `false` → immediate pass-through

### Operational Risks
- Remote workers, VPN users, and mobile data users will have varying IPs — `ipRestrictions` must be configured per location carefully (CIDR ranges, not single IPs)
- Wrong IP list = mass lockout

### Verification Tests
- [ ] Flag false → any IP logs in
- [ ] Flag true, IP in allowlist → login succeeds
- [ ] Flag true, IP not in allowlist → 403 + IP_ACCESS_DENIED
- [ ] Flag true, location has no ipRestrictions configured → login passes
- [ ] Superuser from blocked IP → login succeeds

---

## Layer 4 — Attendance GPS/IP Enforcement

### Current Implementation Status
- **Status: Partially implemented — detection complete, enforcement not wired**
- `server/attendance-security-service.ts`: full GPS spoofing detection pipeline (8 steps), distance-to-office calculation, IP match, accuracy checks, multi-flag spoofing scoring
- All outcomes write to `attendance_security_audit` table
- File header: *"ADVISORY ONLY — never blocks check-in"*
- `blocked: false` is hardcoded in every outcome — the flag `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` is **never read** inside the service
- Check-in proceeds regardless of any violation detected

### Missing Backend Logic

**A. Flag read inside `attendance-security-service.ts`**
The service must:
1. At the start of the pipeline, read `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED`
2. Store it as `const enforcing = await isFeatureFlagEnabled('SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED')`
3. In the outcome determination block (Step 8), when `enforcing = true`:
   - `advisory_spoofing_detected` → set `blocked: true`
   - `advisory_outside_geofence` → set `blocked: true`
   - `advisory_ip_unverified` → set `blocked: true` (if IP enforcement is configured for location)
   - `advisory_low_accuracy` → remain `blocked: false` (accuracy warning, not a block condition)
   - `advisory_ok` → `blocked: false`
4. When `enforcing = false`: all outcomes remain `blocked: false` (current behaviour)

**B. Attendance route response to `blocked: true`**
The attendance route that calls the security service must:
1. Check `securityResult.blocked`
2. If `true`: return HTTP 403 `{ code: 'ATTENDANCE_BLOCKED', reason: securityResult.outcome, severity: securityResult.severity }`
3. Do NOT write the check-in record — the check-in is refused
4. The `attendance_security_audit` row IS written (blocked attempts must be auditable)

**C. Superuser attendance override**
When a check-in is blocked, a Superuser must be able to manually approve it via the existing override route (`PATCH /api/admin/attendance/records/:id/override`). However, since the check-in record is not created when blocked, a separate "blocked check-in queue" or an override flag on the security audit row is needed.

**Recommended:** Add a `manual_override_granted_by` and `manual_override_at` column to `attendance_security_audit`. When a Superuser grants an override for a blocked check-in ID, create the attendance record retroactively.

### Missing Schema / Tables / Flags
- `attendance_security_audit`: add `manual_override_granted_by integer`, `manual_override_at timestamptz` columns
- No new tables required (advisory data already accumulates in `attendance_security_audit`)

### Feature Flag Behaviour
| Flag state | Runtime behaviour |
|---|---|
| `false` | Full pipeline runs, violations logged, `blocked: false` always (current advisory) |
| `true` | Full pipeline runs, violations logged, spoofing/outside-geofence → `blocked: true`, check-in refused |

### Advisory vs Enforced
This is the key distinction for Layer 4:
- **Advisory (flag = false):** Check-in proceeds, violation is logged, HR can review reports via spoofing-flags API. No attendance record impact.
- **Enforced (flag = true):** Spoofing/out-of-bounds check-in is refused. A blocked check-in appears as an absence unless Superuser manually overrides. This feeds into payroll as attendance-status SSoT — payroll arithmetic does NOT change.

### Superuser Exemption
- Superuser's own check-ins: bypass enforcement (Superuser is never blocked)
- Superuser acting on others: can override a blocked check-in via the admin override route

### Emergency Disable
- Set `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = false` → advisory-only immediately
- Blocked check-ins that occurred while enforced remain as absences unless explicitly overridden
- Write a note in the enforcement page: "Emergency disable does not retroactively approve previously blocked check-ins"

### Rollout Strategy
1. Run advisory mode for minimum 2 weeks — review `attendance_security_audit` spoofing flags
2. Identify false positives (genuine users showing as outside geofence, low GPS accuracy)
3. Tune geofence radii in `work_locations` to reduce false positives
4. Set `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = true` during a low-volume period (start of month)
5. Monitor blocked check-ins daily for first week

### Rollback Strategy
- Set flag to `false` → advisory mode immediately
- All future check-ins proceed regardless of GPS
- Past blocked check-ins remain as absences — Superuser must manually override if rollback was triggered by false positives

### Operational Risks
- GPS accuracy indoors can be poor — `advisory_low_accuracy` must NOT be a block condition
- Mobile data switches (WiFi → 4G during check-in) can cause IP mismatch — IP block condition should have a soft threshold
- Battery-saving mode disables GPS on some devices — timeout outcomes must not block

### Verification Tests
- [ ] Flag false + spoofing detected → check-in succeeds, audit row written, `blocked = false`
- [ ] Flag true + `advisory_ok` → check-in succeeds
- [ ] Flag true + `advisory_spoofing_detected` → check-in refused, 403 returned, audit row written with `blocked = true`
- [ ] Flag true + `advisory_outside_geofence` → check-in refused
- [ ] Flag true + `advisory_low_accuracy` → check-in succeeds (not a block condition)
- [ ] Flag true + Superuser checks in from outside geofence → check-in succeeds (exemption)
- [ ] Emergency disable → previously blocked user can now check in

---

## Layer 5 — Attendance & Payroll Re-Authentication

### Current Implementation Status
- **Status: Partially implemented — core works, flag name mismatch, 2 gates missing**

**What works:**
- `server/middleware/require-reauth.ts` — fully functional: reads `SECURITY_REAUTH_ENABLED` (= `true`), queries `sensitive_action_policies`, issues `REAUTH_REQUIRED`, writes `reauth_audit_log`
- 5 payroll/salary routes are gated: `payroll.run_official`, `payroll.approve_increment`, `payroll.lock_period` (policy exists, route wire unconfirmed), `salary.update_base`, `salary.update_bank_details`
- 7 security admin actions are gated: `security.force_logout`, `security.grant_device_trust`, `security.revoke_session`, `security.update_2fa_policy`, `security.update_login_policy`, `security.update_attendance_policy`, `user.*` actions

**What does NOT work:**
1. **Flag name mismatch:** `require-reauth.ts` reads `SECURITY_REAUTH_ENABLED` (= `true`, always-on). The enforcement page saves to `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED` (= `false`). These are two different flags. The toggle in the UI has zero effect on actual enforcement.
2. **Missing gate:** `PATCH /api/admin/attendance/records/:id/override` — no `requireReauth` middleware
3. **Missing gate:** Attendance regularisation approval route — no `requireReauth` middleware
4. **Unconfirmed:** `payroll.lock_period` policy exists in DB but the route wire was not confirmed

### Missing Backend Logic

**A. Flag name resolution**
Two options:
- **Option A (recommended):** Rename the middleware's flag check from `SECURITY_REAUTH_ENABLED` to `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED`. This makes the toggle control the middleware. `SECURITY_REAUTH_ENABLED` becomes a legacy alias or is removed.
- **Option B:** Make `isFeatureFlagEnabled('SECURITY_REAUTH_ENABLED')` also check `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED` (OR logic) — more complex, less clean.
Option A is recommended. Risks: re-auth is currently always-on (`SECURITY_REAUTH_ENABLED = true`). Renaming the flag means re-auth goes to whatever `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED` is set to. Currently `false` → re-auth would stop working immediately. Migration requires setting `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = true` in DB BEFORE renaming the middleware reference.

**B. Add missing gates**
```
PATCH /api/admin/attendance/records/:id/override
  → add requireReauth('attendance.override_admin') before handler

POST /api/admin/attendance/regularisation/:id/approve (confirm exact route path)
  → add requireReauth('attendance.approve_regularisation') before handler
```

**C. Add missing sensitive_action_policies rows**
```sql
INSERT INTO sensitive_action_policies (action_key, challenge_type, timeout_minutes, is_active)
VALUES
  ('attendance.override_admin', 'any', 30, true),
  ('attendance.approve_regularisation', 'any', 30, true);
```

**D. Confirm `payroll.lock_period` route wire**
Search all payroll route files for `lock_period` and confirm `requireReauth('payroll.lock_period')` is present.

### Missing UI Logic
- None — the re-auth modal already exists in the frontend
- The enforcement page correctly shows the toggle; the fix is purely backend (flag name + missing gates)

### Missing Schema / Tables / Flags
- No new tables — `reauth_audit_log` and `sensitive_action_policies` are in place
- New DB rows needed in `sensitive_action_policies`: `attendance.override_admin`, `attendance.approve_regularisation`

### Feature Flag Behaviour (after fix)
| Flag | State after fix | Runtime behaviour |
|---|---|---|
| `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED` | Controlled by UI toggle | Middleware reads this flag |
| `SECURITY_REAUTH_ENABLED` | Keep as `true` (legacy — do not remove until migration confirmed) | Retired from middleware |

### Advisory vs Enforced
Layer 5 is binary — either the re-auth gate is present or it is not. No advisory mode.

### Superuser Exemption
- Superuser is NOT exempt from re-auth gates — this is intentional (financial and security actions require TOTP/password even for Superuser)
- If Superuser exemption is desired for specific actions, it must be configured per `sensitive_action_policies.is_active` with a role check inside the middleware (not currently implemented)

### Emergency Disable
- Set `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = false` → all re-auth gates pass through immediately
- This disables ALL sensitive action protection simultaneously — high risk
- Preferred: set specific policy `is_active = false` for the affected action only

### Rollout Strategy
1. Set `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = true` in DB
2. Add missing policy rows for `attendance.override_admin` and `attendance.approve_regularisation`
3. Update `require-reauth.ts` to read `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED` instead of `SECURITY_REAUTH_ENABLED`
4. Add `requireReauth()` calls to missing routes
5. Test all gated routes manually
6. Toggle is now fully functional

### Rollback Strategy
- Set `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = false` → all gates pass immediately

### Verification Tests
- [ ] `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = false` → `POST /run/start` proceeds without TOTP
- [ ] `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = true` → `POST /run/start` returns REAUTH_REQUIRED
- [ ] Valid re-auth token → `POST /run/start` proceeds
- [ ] `PATCH /admin/attendance/records/:id/override` without token → REAUTH_REQUIRED
- [ ] Payroll.lock_period route → REAUTH_REQUIRED when flag true
- [ ] Toggle in enforcement page → changes flag → immediately affects next API call

---

## Layer 6 — Security Audit Logging

### Current Implementation Status — Sub-layer by Sub-layer

#### 6A — Login & Session Audit
- **Status: Fully implemented and always live**
- `auth.ts` reads `SECURITY_LOGIN_AUDIT_ENABLED` (= `true`) on login success, failure, and lockout
- Writes to `login_audit_log` with IP, outcome, user, timestamp
- `security-login-service.ts` also writes to `login_audit_log` via a transaction path
- No gaps

#### 6B — Attendance Location Audit
- **Status: Fully implemented and always live**
- `SECURITY_ATTENDANCE_AUDIT_ENABLED = true`
- Every check-in writes a detailed row to `attendance_security_audit` via the advisory pipeline in `attendance-security-service.ts`
- Columns include: GPS coordinates, accuracy, spoofing flags, distance to office, IP address, outcome, severity
- `GET /api/attendance/spoofing-flags` exposes violations to Superuser/HR
- No gaps

#### 6C — Log Archival (Nightly)
- **Status: Table only — no implementation**
- `securityArchivalLog` table exists in schema
- `SECURITY_ARCHIVAL_ENABLED = false`
- No cron job, archival worker, GCS upload, or age-based purge logic exists anywhere
- `login_audit_log` and `attendance_security_audit` grow unbounded

#### 6D — Security Monitoring
- **Status: UI only — no implementation**
- `SECURITY_MONITORING_ENABLED = false`
- No monitoring service, anomaly detection, or alerting code exists in the security stack
- Agent framework pattern detection is for leave/project agents — unrelated

### Missing Backend Logic

**6C — Archival**
A nightly archival job must:
1. Read `SECURITY_ARCHIVAL_ENABLED`
2. If enabled: select all `login_audit_log` rows older than 90 days (configurable)
3. Batch-insert into `security_archival_log` with `source_table = 'login_audit_log'`
4. Repeat for `attendance_security_audit` rows older than 90 days
5. Delete source rows after archival insert (write-confirm first)
6. Repeat for `reauth_audit_log`
The job must be idempotent and run inside a transaction.

Integration with existing cron infrastructure: check `server/` for an existing cron scheduler (the agent framework has one at `server/agents/framework/scheduler.ts`) — archival job should register here.

**6D — Monitoring**
A monitoring engine must:
1. Read `SECURITY_MONITORING_ENABLED`
2. If enabled, run scheduled checks (e.g., every 15 minutes):
   - Multiple failed logins from same IP within 10 minutes → alert
   - Same user account failed login > 5 times within 1 hour → alert (distinct from lockout)
   - Unusual login hour (outside 07:00–22:00 IST) → flag
   - Login from new city/ISP → flag (requires IP geolocation)
3. Alerts stored in a `security_monitoring_alerts` table
4. Optional: send email via SendGrid on high-severity alerts

### Missing Schema / Tables / Flags

**6C — Archival:** No new tables — `security_archival_log` exists in schema. Add configurable retention period to `epc_migration_feature_flags` or a dedicated `security_archival_config` table (retention days per source table).

**6D — Monitoring:** New table required:
```sql
CREATE TABLE security_monitoring_alerts (
  id serial PRIMARY KEY,
  alert_type text NOT NULL,           -- 'brute_force', 'unusual_hour', 'new_location'
  severity text NOT NULL,             -- 'low', 'medium', 'high', 'critical'
  user_id integer REFERENCES users(id),
  ip_address text,
  details jsonb,
  acknowledged_by integer REFERENCES users(id),
  acknowledged_at timestamptz,
  created_at timestamptz DEFAULT NOW()
);
```

### Feature Flag Behaviour

| Flag | State | Behaviour |
|---|---|---|
| `SECURITY_LOGIN_AUDIT_ENABLED` | `true` (always-on) | Login events written unconditionally |
| `SECURITY_ATTENDANCE_AUDIT_ENABLED` | `true` (always-on) | Check-in events written unconditionally |
| `SECURITY_ARCHIVAL_ENABLED` | `false` | When `true`, nightly archival job runs |
| `SECURITY_MONITORING_ENABLED` | `false` | When `true`, monitoring checks run every 15 min |

### Superuser Exemption
- Superuser actions are audited the same as all other roles — no exemption from audit logging
- Superuser can view and acknowledge monitoring alerts

### Emergency Disable
- Archival: set `SECURITY_ARCHIVAL_ENABLED = false` → nightly job skips (source tables keep accumulating)
- Monitoring: set `SECURITY_MONITORING_ENABLED = false` → alert checks stop, existing alerts remain

### Rollout Strategy
**6C Archival:**
1. Implement and test the archival job in staging (no prod data deletion)
2. Run one manual archival cycle, confirm row counts match
3. Set `SECURITY_ARCHIVAL_ENABLED = true` — nightly job begins
4. Monitor source table row counts for first 2 weeks

**6D Monitoring:**
1. Implement monitoring engine with only the brute-force check first
2. Run for 1 week in log-only mode (no alerts sent, just stored)
3. Review false positive rate
4. Enable alert delivery
5. Add remaining checks incrementally

### Rollback Strategy
- Archival: disable flag; no data loss as source rows are not deleted before archival is confirmed
- Monitoring: disable flag; historical alerts remain in table

### Verification Tests
**6C:**
- [ ] Flag true → rows older than 90 days move from `login_audit_log` to `security_archival_log`
- [ ] Flag true → source rows deleted only after archival insert succeeds
- [ ] Flag false → no rows moved
- [ ] Job is idempotent — running twice does not duplicate archival rows

**6D:**
- [ ] 6 failed logins within 10 min from same IP → alert row created, severity = high
- [ ] Login at 02:00 IST → flag row created, severity = low
- [ ] Flag false → no alerts created regardless of events

---

## Layer 7 — Payroll Impact Review

### Current Implementation Status
- **Status: UI only — zero backend implementation**
- `SECURITY_PAYROLL_IMPACT_REVIEW_ENABLED = false` — exists in DB
- No `payroll_impact_review_queue` table in schema
- No review API routes
- `GET /api/attendance/spoofing-flags` exposes raw spoofing detection rows but has no review/decision/dismiss workflow
- No bridge from attendance security audit violations to a payroll review queue

### Architecture Intent (Separation Rule)
Layer 7 does NOT change payroll arithmetic. It provides HR and Superuser with a queue of attendance records that were flagged by the security pipeline (spoofing, outside geofence), so they can decide whether to:
- **Accept as-is** (the blocked/advisory check-in stands; payroll reflects the absence)
- **Override** (manually approve the check-in; payroll reflects the attendance)

The decision is stored as a record. `payroll-salary-core.ts` remains unchanged — it reads attendance status as-is, which is already correct based on what the Superuser approved or left blocked.

### Missing Backend Logic

**A. Queue population**
When `SECURITY_PAYROLL_IMPACT_REVIEW_ENABLED = true`, the `attendance-security-service.ts` pipeline must:
1. After writing the `attendance_security_audit` row, if `outcome` is `advisory_spoofing_detected`, `advisory_outside_geofence`, or `advisory_ip_unverified`
2. Insert a row into `payroll_impact_review_queue`
3. Queue row references the `attendance_security_audit.id` and the `user_id`, `date`, `outcome`

**B. Review API routes**
```
GET    /api/admin/payroll/impact-review-queue          Superuser/GM — list pending items
POST   /api/admin/payroll/impact-review-queue/:id/approve    Accept check-in, create attendance record
POST   /api/admin/payroll/impact-review-queue/:id/reject     Confirm as absence (no attendance record)
GET    /api/admin/payroll/impact-review-queue/:id/audit      Review history for this item
```

All three mutation routes must be gated with `requireReauth('payroll.impact_review_decision')`.

**C. Payroll lock-period integration**
When payroll lock is triggered for a period, check if there are unresolved queue items for that period. If yes, warn the Superuser (do not block lock — just warn). This is a preflight check, not a blocker.

### Missing Schema / Tables / Flags

**New table: `payroll_impact_review_queue`**
```sql
CREATE TABLE payroll_impact_review_queue (
  id serial PRIMARY KEY,
  security_audit_id integer NOT NULL REFERENCES attendance_security_audit(id),
  user_id integer NOT NULL REFERENCES users(id),
  date date NOT NULL,
  outcome text NOT NULL,              -- the security pipeline outcome
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  reviewed_by integer REFERENCES users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz DEFAULT NOW(),
  payroll_period_id integer REFERENCES payroll_periods(id)
);
CREATE INDEX ON payroll_impact_review_queue (user_id, date);
CREATE INDEX ON payroll_impact_review_queue (status, payroll_period_id);
```

**New sensitive_action_policy row:**
```sql
INSERT INTO sensitive_action_policies (action_key, challenge_type, timeout_minutes, is_active)
VALUES ('payroll.impact_review_decision', 'any', 30, true);
```

### Feature Flag Behaviour
| Flag state | Runtime behaviour |
|---|---|
| `false` | Advisory violations logged to `attendance_security_audit` only; no queue populated |
| `true` | Spoofing/geofence violations additionally inserted into `payroll_impact_review_queue` for HR review |

### Advisory vs Enforced
Layer 7 is a workflow layer, not an enforcement layer. It sits on top of Layer 4:
- When Layer 4 is advisory only (flag false) → Layer 7 can still queue advisory violations for review (HR sees them, no attendance impact)
- When Layer 4 is enforced (flag true) → blocked check-ins flow into the queue for override decisions

### Superuser Exemption
- Superuser's own check-ins are not queued even if they trigger advisory violations
- Superuser can review and decide on all other users' queued items

### Emergency Disable
- Set `SECURITY_PAYROLL_IMPACT_REVIEW_ENABLED = false` → queue stops receiving new items
- Existing pending items remain in the queue — they must be resolved or will persist unreviewed
- Recommend: before disabling, bulk-reject all pending items with a note "Emergency disable — treated as absence"

### Rollout Strategy
1. Enable Layer 4 in advisory mode first — let `attendance_security_audit` accumulate real data
2. Build and test queue population logic + review API routes
3. Build review UI page (queue list, approve/reject actions)
4. Run parallel review for 2 weeks — compare review decisions to what payroll would have done without the queue
5. Set `SECURITY_PAYROLL_IMPACT_REVIEW_ENABLED = true`
6. Enable Layer 4 enforcement only after the review queue is operational (so every block has a review path)

### Rollback Strategy
- Set flag to `false` → queue stops populating
- Pending items remain, can be bulk-rejected via a Superuser admin action

### Verification Tests
- [ ] Flag false → spoofing check-in advisory → no queue row created
- [ ] Flag true → spoofing check-in → queue row created with `status = 'pending'`
- [ ] Flag true + `advisory_ok` → no queue row created
- [ ] `POST /queue/:id/approve` without reauth → REAUTH_REQUIRED
- [ ] `POST /queue/:id/approve` with valid reauth → attendance record created, `status = 'approved'`
- [ ] `POST /queue/:id/reject` → `status = 'rejected'`, no attendance record (absence stands)
- [ ] Payroll lock preflight → warns if pending queue items exist for period

---

## Cross-Layer Dependencies

```
Layer 1 (2FA)
  └── No dependencies — self-contained at login gate

Layer 2 (Trusted Device)
  └── Reads global apply_to_roles (shared with Layer 1 via enforcement-scope)
  └── No dependency on other layers

Layer 3 (App Access GPS/IP)
  └── Reads work_locations.ipRestrictions (same table as Layer 4)
  └── Must be enabled AFTER Layer 2 (device trust) to prevent regressions

Layer 4 (Attendance GPS/IP)
  └── Feeds → Layer 6B (attendance audit) — always
  └── Feeds → Layer 7 (review queue) — when Layer 7 flag is enabled
  └── If Layer 4 = enforced, Layer 7 MUST be operational first (blocked check-ins need a review path)

Layer 5 (Re-Auth)
  └── Depends on: sensitive_action_policies rows being correct
  └── Indirectly depends on Layer 1 (TOTP must be set up for 'totp'-type policies to work)
  └── Flag name fix must not disable re-auth while TOTP setup is in progress

Layer 6 (Audit Logging)
  └── 6A and 6B: No dependencies — always-on
  └── 6C (Archival): Depends on 6A and 6B producing rows to archive
  └── 6D (Monitoring): Depends on 6A (login events) being reliably written

Layer 7 (Payroll Review)
  └── Depends on Layer 4 (attendance security pipeline) generating audit rows
  └── Depends on Layer 5 (re-auth) for review decision gates
  └── Does NOT depend on payroll calculation layer
```

### Enabling Order (Recommended)

```
Step 1: Layer 5 flag fix (no user impact — just makes the toggle work)
Step 2: Layer 2 (trusted device) — lowest risk, fully implemented
Step 3: Layer 6C (archival) — background job, no enforcement impact
Step 4: Layer 1 (2FA enforcement) — requires pre-enrolment of all target users
Step 5: Layer 4 (advisory → enforce) — requires Layer 7 to be ready
Step 6: Layer 7 (review queue) — must be live before Layer 4 enforcement
Step 7: Layer 3 (app access IP) — requires work_locations IP data complete
Step 8: Layer 6D (monitoring) — last, as it has the most moving parts
```

---

## Rollout Sequence

### Phase 1 — Fix & Wire (No user-visible change)
| Task | Layer | Risk |
|---|---|---|
| Fix flag name mismatch in `require-reauth.ts` | 5 | Low (set new flag to true before rename) |
| Add `requireReauth` to attendance override route | 5 | Low |
| Add `requireReauth` to regularisation approve route | 5 | Low |
| Add `sensitive_action_policies` rows for attendance actions | 5 | None |
| Add Layer 1 login gate in `auth.ts` | 1 | Medium — test thoroughly |
| Add Layer 2 role scope check in device trust | 2 | Low |

### Phase 2 — Enable Existing Infrastructure
| Task | Layer | Risk |
|---|---|---|
| Enable `SECURITY_DEVICE_TRUST_ENABLED` (after device pre-registration) | 2 | Medium |
| Enable `SECURITY_ARCHIVAL_ENABLED` (after archival job implemented) | 6C | Low |
| Enable `SECURITY_2FA_POLICY_ENABLED` (after all target users enrolled) | 1 | High — test lockout path |

### Phase 3 — Build & Enable New Infrastructure
| Task | Layer | Risk |
|---|---|---|
| Build and enable payroll review queue | 7 | Low (additive only) |
| Build Layer 3 IP middleware | 3 | High — populate IP lists first |
| Switch Layer 4 from advisory to enforced | 4 | High — Layer 7 must be live |
| Build and enable monitoring engine | 6D | Low |

---

## Zero-Trust Audit Plan

### Principle
Every security enforcement decision must be verifiable after the fact, from first principles, with no trust placed in application state.

### Audit Evidence Required Per Layer

| Layer | Audit Table | What to verify |
|---|---|---|
| 1 — 2FA | `two_fa_policy_audit_log` | Policy change author, timestamp, from/to values |
| 1 — 2FA | `login_audit_log` | Outcome = `blocked_no_totp` for enforced-unenrolled users |
| 2 — Device | `trusted_devices` | Every device grant has a `granted_by` and `granted_at` |
| 2 — Device | `login_audit_log` | Outcome = `blocked_untrusted_device` |
| 3 — App Access | `login_audit_log` | Outcome = `blocked_ip_denied` |
| 4 — Attendance | `attendance_security_audit` | Every check-in has a row; blocked rows have `blocked = true` |
| 5 — Re-Auth | `reauth_audit_log` | Every sensitive action has a prior `outcome = 'required'` and `outcome = 'reused'` pair |
| 6A — Login | `login_audit_log` | Every login attempt (success + failure) present |
| 6B — Attendance | `attendance_security_audit` | Every check-in present with GPS data |
| 6C — Archival | `security_archival_log` | Source rows present; no orphaned source rows |
| 7 — Review | `payroll_impact_review_queue` | Every review decision has `reviewed_by` and `reviewed_at` |

### Zero-Trust Verification Queries (to run before each payroll lock)

```sql
-- 1. Any 2FA enforcement blocks this period?
SELECT COUNT(*) FROM login_audit_log
WHERE outcome = 'blocked_no_totp'
  AND created_at >= '2026-05-01' AND created_at < '2026-06-01';

-- 2. Any trusted device blocks?
SELECT COUNT(*) FROM login_audit_log
WHERE outcome = 'blocked_untrusted_device'
  AND created_at >= '2026-05-01' AND created_at < '2026-06-01';

-- 3. Any attendance blocks with no review decision?
SELECT q.user_id, q.date, q.outcome, q.status
FROM payroll_impact_review_queue q
WHERE q.status = 'pending'
  AND q.date >= '2026-05-01' AND q.date < '2026-06-01';

-- 4. Any sensitive payroll actions without a prior reauth record?
SELECT ral.user_id, ral.action_key, ral.outcome, ral.created_at
FROM reauth_audit_log ral
WHERE ral.action_key LIKE 'payroll.%'
  AND ral.outcome = 'required'
  AND ral.created_at >= '2026-05-01'
ORDER BY created_at;

-- 5. Attendance security audit coverage — any check-in with no audit row?
SELECT ar.id, ar.user_id, ar.check_in_time
FROM attendance_records ar
LEFT JOIN attendance_security_audit asa ON asa.attendance_record_id = ar.id
WHERE asa.id IS NULL
  AND ar.check_in_time >= '2026-05-01';
```

### Audit Frequency
- **Daily:** Review `attendance_security_audit` for new spoofing flags
- **Weekly:** Review `login_audit_log` for blocked logins and lockouts
- **Monthly (before payroll lock):** Run all 5 zero-trust verification queries; resolve any pending `payroll_impact_review_queue` items
- **Quarterly:** Review `trusted_devices` for stale/unused devices; revoke as appropriate

---

## Document Control

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 2026-05-09 |
| Author | THERMOPAC QMS Agent |
| Status | Plan — not implemented |
| Next review | After Phase 1 implementation |
| Non-negotiable | `payroll-salary-core.ts` — ZERO changes |
| Separation | Plane A (App Access) | Plane B (Attendance) | Plane C (Payroll arithmetic) |
