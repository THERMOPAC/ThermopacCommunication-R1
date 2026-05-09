# Security Enforcement Scope — Pre-Approval Document v1.0
**Page:** `/admin/security-enforcement` (rename from `/admin/2fa-policy`)  
**Status:** PENDING APPROVAL — No implementation until this document is signed off  
**Date:** 2026-05-09  
**Author:** Engineering  

---

## 1. Purpose

This document proposes expanding the current `/admin/2fa-policy` page into a unified **Security Enforcement Scope** control panel. The new page governs seven independent security layers, each with its own feature flag, role scope, TOTP-gated save, and audit trail.

The current page manages only the 2FA policy (`two_fa_global_policy` singleton). The proposed page adds six additional enforcement layers, all of which already have partial or full infrastructure in the codebase and database.

---

## 2. Architecture Separation — Non-Negotiable

Three planes that must never be coupled:

```
Plane A — Application Access Security
  └── 2FA, Trusted Devices, App GPS/IP (who can log in and from where)

Plane B — Attendance Enforcement
  └── Attendance GPS/IP, Spoofing Detection (is this check-in valid?)

Plane C — Payroll Logic
  └── payroll-salary-core.ts — ZERO changes. EVER.
      Payroll reads attendance_status as single source of truth.
      Security violations NEVER auto-alter payroll calculations.
```

Layers 1–3 are Plane A. Layers 4–5 are Plane B. Layers 6–7 are governance controls spanning both planes.

---

## 3. The Seven Security Layers

### Layer 1 — 2-Step Verification (2FA)
**Current state:** Infrastructure fully built (Phase 6). Feature flag `SECURITY_2FA_POLICY_ENABLED = false`.  
**DB table:** `two_fa_global_policy` (singleton, id=1)  
**Current DB row:** `enforcement_mode='optional'`, `apply_to_roles={}`, `grace_period_days=14`

| Toggle | Default | Enforcement modes |
|---|---|---|
| Enable 2FA | Off (flag=false) | Optional / Required Immediately / Required From Date |

**Scope:** All 6 roles. Role-scoped checkbox selection.  
**Grace period:** Applies only to "Required Immediately" mode.  
**Reauth required for changes:** `security.update_2fa_policy` (challenge=`any`, timeout=0 — always re-auths).

---

### Layer 2 — Trusted Device Enforcement
**Current state:** Infrastructure built. Flag `SECURITY_DEVICE_TRUST_ENABLED = false`. 4 devices registered, 1 active.  
**DB tables:** `trusted_devices`, `trusted_device_audit_log`  
**Routes:** `server/admin-device-routes.ts`, `server/security-device-routes.ts`  
**Login policy reference:** `login_security_policies.require_device_trust` — currently `true` for `high_security` (Superuser/GM/SM), `false` for all others.

| Toggle | Default | Behaviour when enabled |
|---|---|---|
| Enable Trusted Device Enforcement | Off (flag=false) | Login challenged if device fingerprint not in trusted registry |

**Scope:** Currently `login_security_policies` binds this per role-level tier. The UI must show which tiers are affected.  
**Recovery governance:** Admin can grant trust via `security.grant_device_trust` action (challenge=`totp`, timeout=0).  
**No new DB tables required** — infrastructure is complete.

---

### Layer 3 — Application Access GPS/IP Enforcement
**Current state:** `login_security_policies.allowed_networks` column exists (currently NULL for all 3 rows). No active enforcement route found.  
**DB table:** `login_security_policies` — has `allowed_networks` text[] column.  
**Work locations:** 3 active locations, all with **NULL lat/lng** and **empty IP restrictions**.

| Toggle | Default | Behaviour when enabled |
|---|---|---|
| Enable App Access GPS/IP Enforcement | Off (new flag) | Block ERP login from outside approved IP ranges / GPS geofence |

**New flag required:** `SECURITY_APP_ACCESS_ENFORCEMENT_ENABLED`  
**New sensitive action required:** `security.update_app_access_policy` (challenge=`totp`, timeout=0)  
**Dependency:** Work location GPS coordinates and/or IP lists must be populated before enabling. Enabling with NULL coordinates = no-op (pass-through).  
**Scope:** Role-based, per `login_security_policies` tier.  
**Separation from Layer 4:** This enforces who can open the ERP. Attendance GPS enforces where they check in. They share `work_locations` data but have independent evaluation paths and independent flags.

**Schema impact — minimal:** `login_security_policies` already has `allowed_networks text[]`. May need a `gps_enforcement_enabled boolean` column added.

---

### Layer 4 — Attendance GPS/IP Enforcement
**Current state:** Advisory pipeline fully built (Phase 5). Flag `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = false`.  
**DB tables:** `attendance_security_policies` (3 rows), `attendance_location_audit_log` (11 rows, all advisory outcomes)  
**Service:** `server/attendance-security-service.ts` — hardcoded `blocked: false` in return type.

| Toggle | Default | Behaviour when enabled |
|---|---|---|
| Enable Attendance GPS/IP Enforcement | Off (flag=false) | Promote from advisory to blocking at check-in |

**Current policy rows:**

| Policy | Roles | Mode | GPS Required |
|---|---|---|---|
| exempt_policy | Superuser, General Manager, Senior Manager | exempt | No |
| advisory_manager | Manager | advisory | Yes |
| advisory_standard | Senior Executive, Employee | advisory | Yes |

**Enabling this flag changes `advisory` → `enforced` behaviour** in the audit pipeline. The `blocked: false` literal type in `AttendanceAuditResult` must be changed to `boolean` when implementation proceeds.  
**Dependency:** Work location lat/lng must be populated first. All 3 current locations have NULL coordinates — enforcement with NULL = always passes (no distance can be computed).  
**No new DB schema required.**

---

### Layer 5 — Attendance & Payroll Module 2FA/Re-Auth
**Current state:** `sensitive_action_policies` table exists with 15 rows. Payroll actions already registered:

| Action Key | Challenge | Timeout |
|---|---|---|
| `payroll.run_official` | any | 30 min |
| `payroll.lock_period` | password | 30 min |
| `payroll.approve_increment` | any | 30 min |
| `salary.update_base` | password | 30 min |
| `salary.update_bank_details` | any | 30 min |

**What this layer adds:** A UI toggle to require re-auth for **attendance module actions** (e.g., admin attendance override, regularisation approval) that do not yet have `sensitive_action_policies` entries.

| Toggle | Default | Behaviour when enabled |
|---|---|---|
| Require 2FA/Re-Auth for Attendance & Payroll modules | Off (new flag) | Attendance override / payroll run actions require TOTP challenge |

**New flag required:** `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED`  
**New sensitive action rows required** (attendance override, regularisation approve/reject)  
**Payroll guarantee:** This layer adds re-auth gates on the UI/API surface. It does NOT touch `payroll-salary-core.ts`, does not alter payroll calculations, and does not change attendance status. The attendance record is the SSoT; re-auth only controls who is permitted to submit the change.

---

### Layer 6 — Security Audit Logging
**Current state:** Partially active.

| Flag | Current Value |
|---|---|
| `SECURITY_LOGIN_AUDIT_ENABLED` | **true** |
| `SECURITY_ATTENDANCE_AUDIT_ENABLED` | **true** |
| `SECURITY_ARCHIVAL_ENABLED` | **false** |
| `SECURITY_MONITORING_ENABLED` | **false** |

**DB tables:** `login_audit_log`, `attendance_location_audit_log`, `reauth_audit_log`, `trusted_device_audit_log`, `two_fa_policy_audit_log`, `security_archival_log`

| Toggle | Default | Behaviour |
|---|---|---|
| Enable Security Audit Logging | On (login+attendance flags already true) | All security events written to immutable audit logs |

This is a master visibility toggle. Individual sub-flags (login audit, archival, monitoring) remain independently controlled.  
**No new DB schema required.**

---

### Layer 7 — Payroll Impact Review
**Current state:** Not implemented. No flag, no table.  
**Purpose:** When attendance or security violations are detected (e.g., check-in outside geofence, spoofing flag), surface them in an HR/payroll review queue for human decision-making — without automatically altering any payroll record.

| Toggle | Default | Behaviour when enabled |
|---|---|---|
| Enable Payroll Impact Review | Off (new flag) | Attendance/security violations appear in a review queue; HR decides if manual payroll adjustment is needed |

**New flag required:** `SECURITY_PAYROLL_IMPACT_REVIEW_ENABLED`  
**New DB table required:** `attendance_violation_review_queue`  
**Payroll guarantee:** Violations are surfaced for human review only. No automatic payroll deduction, no automatic LWP, no changes to `payroll-salary-core.ts`. The existing payroll pipeline reads `attendance_records.status` as SSoT and continues to do so unchanged.

---

## 4. Revised UI Structure

```
/admin/security-enforcement
│
├── Page Header
│   ├── Title: "Security Enforcement Scope"
│   ├── Subtitle: "Independent controls for each security layer"
│   └── Live status badges (7 layers — active count shown)
│
├── REAUTH NOTICE BANNER (always visible)
│   └── "Any change to this page requires TOTP verification"
│
├── SECTION 1 — Layer 1: 2-Step Verification
│   ├── Toggle: Enable 2FA
│   ├── [when ON] Enforcement Policy radio: Required Immediately | Required From Date
│   ├── [Required Immediately only] Grace Period toggle + days input
│   ├── [Required From Date only] Date picker
│   └── Role scope checkboxes (6 roles)
│
├── SECTION 2 — Layer 2: Trusted Device Enforcement
│   ├── Toggle: Enable Trusted Device Enforcement
│   ├── [when ON] Role scope (links to login_security_policies tiers)
│   ├── [when ON] Recovery method info (admin-granted trust, TOTP gated)
│   └── Trusted device count badge (4 registered, 1 active)
│
├── SECTION 3 — Layer 3: Application Access GPS/IP Enforcement
│   ├── Toggle: Enable App Access GPS/IP Enforcement
│   ├── [when ON] IP allowlist source: work_locations.ip_restrictions
│   ├── [when ON] GPS geofence source: work_locations lat/lng + radius
│   ├── WARNING if any active work location has NULL lat/lng (currently all 3)
│   └── Role scope
│
├── SECTION 4 — Layer 4: Attendance GPS/IP Enforcement
│   ├── Toggle: Enable Attendance GPS/IP Enforcement
│   ├── [when ON] Promote advisory → enforced for non-exempt roles
│   ├── [when ON] Shows current attendance_security_policies rows
│   ├── WARNING if any active work location has NULL lat/lng (currently all 3)
│   └── NOTE: Exempt roles (Superuser/GM/SM) are always exempt regardless
│
├── SECTION 5 — Layer 5: Attendance & Payroll Module Re-Auth
│   ├── Toggle: Require Re-Auth for Attendance & Payroll Actions
│   ├── [when ON] List of gated actions with challenge types
│   └── NOTE banner: "Does not alter payroll calculations"
│
├── SECTION 6 — Layer 6: Security Audit Logging
│   ├── Toggle: Enable Security Audit Logging (master)
│   ├── [when ON] Sub-toggles: Login Audit | Attendance Audit | Archival | Monitoring
│   └── Audit log stats (row counts per log table)
│
├── SECTION 7 — Layer 7: Payroll Impact Review
│   ├── Toggle: Enable Payroll Impact Review
│   ├── [when ON] Violations flagged for HR review queue
│   └── NOTE banner: "Human review only — payroll calculations unchanged"
│
├── SAVE ROW
│   ├── Last updated timestamp
│   ├── Emergency Disable button (requires TOTP, logs to security_emergency_log)
│   └── Save Policy button (requires TOTP reauth)
│
└── SECTION 8 — Live Policy Summary
    ├── 7-row summary table (one row per layer)
    ├── Active layers count
    ├── Dependency warnings (e.g. GPS enforcement but NULL coordinates)
    └── Rollback guidance text
```

---

## 5. Backend Policy Model Impact

### 5A. Existing tables — no schema changes needed
| Table | Used by layers | Status |
|---|---|---|
| `two_fa_global_policy` | Layer 1 | Complete |
| `trusted_devices` / `trusted_device_audit_log` | Layer 2 | Complete |
| `login_security_policies` | Layer 2, 3 | Has `allowed_networks` column — needs `gps_enforcement_enabled boolean` column |
| `attendance_security_policies` | Layer 4 | Complete |
| `attendance_location_audit_log` | Layer 4, 6 | Complete |
| `sensitive_action_policies` | Layer 5 | Needs new rows for attendance actions |
| All security audit log tables | Layer 6 | Complete |

### 5B. New schema additions required

**1. `login_security_policies` — one new column**
```sql
ALTER TABLE login_security_policies
  ADD COLUMN gps_enforcement_enabled boolean NOT NULL DEFAULT false;
```

**2. `attendance_violation_review_queue` — new table (Layer 7 only)**
```
id, user_id FK users, attendance_record_id FK attendance_records,
audit_log_id FK attendance_location_audit_log,
violation_type varchar(40), spoofing_flags text[],
review_status varchar(20) DEFAULT 'pending',  -- 'pending' | 'reviewed' | 'dismissed'
reviewed_by FK users, reviewed_at timestamp, review_notes text,
created_at timestamp
```

**3. `sensitive_action_policies` — new rows (no schema change, only data)**  
New rows to insert:
- `attendance.override_admin` — challenge=`any`, timeout=30
- `attendance.regularisation_approve` — challenge=`any`, timeout=30
- `security.update_enforcement_scope` — challenge=`totp`, timeout=0

### 5C. Feature flags — new additions to `epc_migration_feature_flags`

| Flag Name | Default | Controls |
|---|---|---|
| `SECURITY_APP_ACCESS_ENFORCEMENT_ENABLED` | false | Layer 3 |
| `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED` | false | Layer 5 |
| `SECURITY_PAYROLL_IMPACT_REVIEW_ENABLED` | false | Layer 7 |

### 5D. Route changes
| Layer | Route needed | Status |
|---|---|---|
| 1 | `PUT /api/admin/2fa-policy` | Exists in `admin-2fa-routes.ts` |
| 2 | `GET/PUT /api/admin/trusted-device-policy` | Route exists; needs policy toggle endpoint |
| 3 | `GET/PUT /api/admin/app-access-policy` | New endpoint needed |
| 4 | `GET/PUT /api/admin/attendance-security-policy` | Exists (`security.update_attendance_policy`) |
| 5 | `GET/PUT /api/admin/reauth-policy` | Needs toggle endpoint |
| 6 | `GET/PUT /api/admin/audit-logging-policy` | Needs flag-flip endpoint |
| 7 | `GET /api/admin/violation-review-queue` | New; `POST /api/admin/violation-review/:id/dismiss` new |

**All PUT/POST routes must use `requireReauth('security.update_enforcement_scope')`.**

### 5E. Single consolidated GET endpoint
```
GET /api/admin/security-enforcement-scope
```
Returns a single JSON object with the state of all 7 layers — one network call to hydrate the entire page. Superuser-only.

---

## 6. Feature Flag Plan

### Current flag state (from DB)
| Flag | Current | Proposed default on page |
|---|---|---|
| `SECURITY_2FA_POLICY_ENABLED` | false | Shown as Layer 1 toggle |
| `SECURITY_DEVICE_TRUST_ENABLED` | false | Shown as Layer 2 toggle |
| `SECURITY_APP_ACCESS_ENFORCEMENT_ENABLED` | *(new)* | false |
| `SECURITY_ATTENDANCE_AUDIT_ENABLED` | **true** | Reflected in Layer 6 sub-toggle |
| `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` | false | Shown as Layer 4 toggle |
| `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED` | *(new)* | false |
| `SECURITY_LOGIN_AUDIT_ENABLED` | **true** | Reflected in Layer 6 sub-toggle |
| `SECURITY_ARCHIVAL_ENABLED` | false | Reflected in Layer 6 sub-toggle |
| `SECURITY_MONITORING_ENABLED` | false | Reflected in Layer 6 sub-toggle |
| `SECURITY_LOCKOUT_ENABLED` | **true** | Not a layer toggle — stays in login policy |
| `SECURITY_REAUTH_ENABLED` | **true** | Not a layer toggle — stays in login policy |
| `SECURITY_PAYROLL_IMPACT_REVIEW_ENABLED` | *(new)* | false |

### Flag isolation guarantee
Every layer reads exactly one flag at the start of its enforcement path. A flag check failure is a fast no-op return — it never throws, never returns an error to the user, and never blocks the primary request.

---

## 7. Rollout Strategy (Recommended Order)

All layers start with their flags set to `false`. Each step requires Superuser TOTP confirmation on the page before the flag is flipped.

```
Step 1 — Populate prerequisites (zero code changes)
  └── Enter GPS lat/lng for all 3 work locations
  └── Enter IP restriction lists for relevant locations
  └── Verify trusted device registry is current

Step 2 — Enable Layer 6 (Audit Logging master toggle)
  └── SECURITY_LOGIN_AUDIT_ENABLED already true
  └── Enable SECURITY_ARCHIVAL_ENABLED
  └── Monitor for 7 days — verify no log volume issues

Step 3 — Enable Layer 1 (2FA) — Required From Date, 30-day window
  └── Set SECURITY_2FA_POLICY_ENABLED = true
  └── Scope: Superuser + General Manager + Senior Manager first
  └── Expand to all roles after 2-week observation

Step 4 — Enable Layer 4 (Attendance GPS/IP) — advisory already on
  └── Confirm GPS coordinates populated (Step 1 prerequisite)
  └── Set SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = true
  └── Exempt roles (Superuser/GM/SM) are auto-exempt — no impact on them
  └── Monitor advisory_outside_geofence rate in audit log before enforcing

Step 5 — Enable Layer 2 (Trusted Device Enforcement)
  └── Confirm trusted device registry is current for all active users
  └── Set SECURITY_DEVICE_TRUST_ENABLED = true
  └── Recovery path: admin TOTP-gated device grant remains available

Step 6 — Enable Layer 5 (Attendance & Payroll Re-Auth)
  └── Add sensitive_action_policies rows for attendance actions
  └── Set SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED = true

Step 7 — Enable Layer 3 (App Access GPS/IP) — optional
  └── Only if IP restriction lists are populated and validated
  └── Set SECURITY_APP_ACCESS_ENFORCEMENT_ENABLED = true

Step 8 — Enable Layer 7 (Payroll Impact Review) — optional
  └── Requires attendance_violation_review_queue table
  └── Set SECURITY_PAYROLL_IMPACT_REVIEW_ENABLED = true
  └── HR/admin configures review cadence
```

---

## 8. Operational Risk Analysis

### Risk 1 — Layer 4 with NULL GPS coordinates
**Severity: High**  
All 3 active work locations currently have `latitude = NULL`, `longitude = NULL`. Enabling `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` with NULL coordinates means the geofence distance can never be computed → all check-ins pass silently.  
**Mitigation:** The UI must show a **blocking dependency warning** on Layer 4 when any active work location has NULL lat/lng. The Save button for Layer 4 must be disabled until coordinates are populated.

### Risk 2 — Accidental global lockout via Layer 3
**Severity: Critical**  
If Layer 3 (App Access GPS/IP) is enabled and IP lists are incorrect or too restrictive, all users including Superuser could be locked out of the ERP.  
**Mitigation:** (a) Superuser role is always in `login_security_policies` row 1 (high_security). The enforcement code must check Superuser exemption first, identical to attendance exempt logic. (b) Emergency disable path via `security_emergency_log` must bypass Layer 3. (c) UI must require explicit acknowledgement before enabling Layer 3.

### Risk 3 — Layer 7 misunderstood as payroll automation
**Severity: Medium**  
If operators interpret the "Payroll Impact Review" toggle as automatic payroll deduction for violations, they may enable it expecting incorrect behaviour.  
**Mitigation:** UI must include a prominent non-removable notice: *"This creates a review queue for human decision-making. It does not alter payroll calculations, does not create LWP entries, and does not change attendance status. payroll-salary-core.ts is not affected."*

### Risk 4 — Layer 2 (Trusted Devices) with stale device registry
**Severity: High**  
Currently 4 registered devices, 1 active. If trusted device enforcement is enabled and the registry is not current, legitimate users will be locked out until an admin grants trust (TOTP required).  
**Mitigation:** Before enabling Layer 2, admin must audit the trusted device list. UI shows current device count badge and links to device management.

### Risk 5 — Payroll re-auth (Layer 5) disrupting payroll run workflow
**Severity: Medium**  
If `payroll.run_official` already requires re-auth and Layer 5 adds additional re-auth gates on attendance overrides, the payroll run workflow could require multiple consecutive TOTP challenges.  
**Mitigation:** Re-auth window is 30 minutes for most payroll actions — a single TOTP challenge covers the full payroll run session. Layer 5 must not add a second challenge for `payroll.run_official` since it is already registered.

### Risk 6 — Page scope creep vs. existing 2FA page
**Severity: Low**  
The current `/admin/2fa-policy` URL will break if renamed to `/admin/security-enforcement`.  
**Mitigation:** Add a redirect from `/admin/2fa-policy` → `/admin/security-enforcement` at the router level. The nav entry in the sidebar must be updated.

---

## 9. Emergency Disable Controls

### Per-layer emergency off
Each layer toggle can be set to off via the normal UI (TOTP required). This is the standard path.

### Emergency master disable
A dedicated **"Emergency Disable All Enforcement"** button (red, confirmation required) must:
1. Require TOTP re-authentication with `timeout=0` (always challenge)
2. Set all enforcement flags to `false` in a single transaction
3. Write a row to `security_emergency_log` (permanent governance log, never deleted)
4. Invalidate all active sessions (uses existing `SECURITY_SESSION_INVALIDATION_ENABLED` path)
5. Display a visible rollback notice with timestamp

### Rollback guidance (shown in Live Policy Summary)
> All policy changes are recorded in `two_fa_policy_audit_log` and `reauth_audit_log`. To roll back:
> 1. Open this page and disable the relevant layer toggle
> 2. Use TOTP re-authentication to save
> 3. All audit logs are immutable and remain intact after rollback
> For a full emergency reset, use the Emergency Disable button above

---

## 10. What Needs Approval

| Item | Decision needed |
|---|---|
| Page rename: `/admin/2fa-policy` → `/admin/security-enforcement` | Approve / Keep old URL |
| Layer 3 (App Access GPS/IP) — add `gps_enforcement_enabled` column to `login_security_policies` | Approve / Defer |
| Layer 7 (Payroll Impact Review) — new `attendance_violation_review_queue` table | Approve / Defer |
| New feature flags: `SECURITY_APP_ACCESS_ENFORCEMENT_ENABLED`, `SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED`, `SECURITY_PAYROLL_IMPACT_REVIEW_ENABLED` | Approve / Defer |
| New sensitive action: `security.update_enforcement_scope` (totp, timeout=0) | Approve |
| New sensitive action rows: `attendance.override_admin`, `attendance.regularisation_approve` | Approve |
| Rollout order (Steps 1–8 above) | Confirm / Modify |

---

*payroll-salary-core.ts — ZERO changes. Not referenced anywhere in this document's implementation scope.*  
*This document is a pre-approval specification only. Implementation begins only after explicit approval of the items in Section 10.*
