# THERMOPAC ERP — Application & Attendance Security Baseline
## Version: 1.0 — Approved
## Date: 09 May 2026
## Status: APPROVED — AWAITING IMPLEMENTATION

---

## Approval Record

| Field | Value |
|---|---|
| Document | Application & Attendance Security Baseline v1.0 |
| Prepared by | THERMOPAC ERP Architect |
| Architecture revisions incorporated | Rev 1 · Rev 2 · Rev 3 · Rev 4 · Rev 5 |
| Approved by | THERMOPAC Management |
| Approval date | 09 May 2026 |
| Implementation start | Pending go-live clearance |
| Next review | 09 May 2027 or after any security incident |

---

## Scope

This baseline governs the security architecture of the THERMOPAC ERP system across two independent security planes:

- **Plane A — Application Security**: Authentication, login policy, session management, trusted device management, forced re-authentication, emergency recovery
- **Plane B — Attendance Security**: GPS geofence enforcement, IP verification, anti-spoofing, attendance audit

Payroll (`server/payroll-salary-core.ts`) is explicitly **out of scope** — zero changes.

---

## Non-Negotiable Constraints

1. `payroll-salary-core.ts` — **zero lines changed** at any point
2. GPS location is never used in login flow — Plane A and Plane B never cross
3. All security audit logs are append-only — no DELETE or UPDATE by application code
4. `security_emergency_log` is permanent — no archival deletion, ever
5. Emergency break-glass is shell-only — never an HTTP endpoint
6. Feature flags default to `enabled = false` — enforcement must be explicitly enabled
7. All attendance policies start as `'advisory'` — `'enforced'` requires explicit admin switch
8. Any deviation from this baseline requires documented approval before implementation

---

## Section 1 — Schema Changes (Complete)

### New Tables

| Table | Purpose | Append-Only |
|---|---|---|
| `login_security_policies` | Per-role login policy (2FA, session, lockout, network) | No |
| `login_audit_log` | Every login attempt | Yes |
| `user_session_registry` | Active session tracking per user | No |
| `attendance_security_policies` | Per-role attendance enforcement policy | No |
| `attendance_location_audit_log` | Every check-in attempt | Yes |
| `trusted_devices` | Registered trusted devices for high_security roles | No |
| `trusted_device_audit_log` | Device register/revoke/login events | Yes |
| `sensitive_action_policies` | Which actions require forced re-auth | No |
| `reauth_audit_log` | Every re-auth attempt for sensitive actions | Yes |
| `security_emergency_log` | Break-glass recovery events | Yes (permanent) |
| `two_fa_global_policy` | Singleton 2FA enforcement policy | No (singleton) |
| `two_fa_policy_audit_log` | 2FA policy change history | Yes |
| `security_archival_log` | Nightly archival job metadata | Yes |

### Column Additions to Existing Tables

| Table | Columns Added |
|---|---|
| `users` | `failed_login_attempts`, `locked_until`, `last_login_at`, `last_login_ip`, `last_login_device` |
| `attendance_records` | `check_in_gps_accuracy_meters`, `check_out_gps_accuracy_meters`, `check_in_mode`, `attendance_policy_mode` |
| `work_locations` | `country_code` |
| All 7 audit log tables | `severity` (`info/warning/critical/emergency`), `archived_at`, `archive_path` |
| `login_audit_log` | `is_trusted_device` |
| `login_security_policies` | `require_device_trust`, `reauth_timeout_minutes` |
| `epc_migration_feature_flags` | New rows (security flags) — no schema change |

### Immutability Triggers

Applied to all 7 append-only audit log tables before go-live:
```sql
CREATE TRIGGER {table}_immutable
BEFORE UPDATE OR DELETE ON {table}
FOR EACH ROW EXECUTE FUNCTION prevent_security_log_tampering();
```
Exception: UPDATE of `archived_at` + `archive_path` (one-way archival transition) is permitted.

---

## Section 2 — API Changes (Complete)

### New Routes — Security (Plane A)

| Method | Route | Auth | Re-Auth | Purpose |
|---|---|---|---|---|
| `POST` | `/api/security/reauth` | Session | — | Verify credential for sensitive action |
| `GET` | `/api/security/my-devices` | Session | — | List own trusted devices |
| `DELETE` | `/api/security/my-devices/:id` | Session | password | Self-revoke device |
| `GET` | `/api/admin/users/:userId/devices` | Superuser/HR | — | Admin: view user devices |
| `DELETE` | `/api/admin/users/:userId/devices/:id` | Superuser | totp | Admin: revoke device |
| `POST` | `/api/admin/users/:userId/devices/grant` | Superuser | totp | Admin: register device |
| `GET` | `/api/admin/device-audit-log` | Superuser | — | Device trust events |
| `GET` | `/api/admin/sessions` | Superuser/HR | — | Active sessions |
| `DELETE` | `/api/admin/sessions/:sessionId` | Superuser | any | Revoke session |
| `POST` | `/api/admin/users/:id/unlock` | Superuser/HR | — | Unlock locked account |
| `POST` | `/api/admin/users/:id/force-logout` | Superuser | totp | Force logout all sessions |
| `POST` | `/api/admin/users/:id/compromise-response` | Superuser | totp | Full compromise response |
| `GET` | `/api/admin/login-audit` | Superuser/HR | — | Login audit log |
| `GET` | `/api/admin/login-security-policies` | Superuser | — | List policies |
| `PUT` | `/api/admin/login-security-policies/:id` | Superuser | totp | Update policy |
| `GET` | `/api/admin/sensitive-action-policies` | Superuser | — | Re-auth policies |
| `PUT` | `/api/admin/sensitive-action-policies/:id` | Superuser | totp | Update re-auth policy |
| `GET` | `/api/admin/reauth-audit-log` | Superuser | — | Re-auth event log |
| `GET` | `/api/admin/suspicious-logins` | Superuser/HR | — | Flagged logins |
| `GET` | `/api/admin/2fa-policy` | Superuser | — | Get 2FA policy |
| `PUT` | `/api/admin/2fa-policy` | Superuser | totp | Update 2FA policy |
| `GET` | `/api/admin/2fa-policy/status` | Superuser/HR | — | Enrollment status |
| `POST` | `/api/admin/2fa-policy/remind` | Superuser/HR | any | Send reminder emails |
| `GET` | `/api/admin/2fa-policy/audit` | Superuser | — | Policy change audit |
| `GET` | `/api/admin/security/monitoring` | Superuser | — | Runtime monitoring dashboard |

### New Routes — Attendance (Plane B)

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/attendance/location-audit` | Superuser/HR | Paginated location audit log |
| `GET` | `/api/attendance/location-audit/:userId` | Superuser/HR/Manager | Per-user log |
| `GET` | `/api/attendance/spoofing-flags` | Superuser/HR | Records with spoofing flags |
| `GET` | `/api/attendance/security-policies` | Superuser | List all policies |
| `PUT` | `/api/attendance/security-policies/:id` | Superuser | totp | Update policy |
| `GET` | `/api/attendance/blocked-checkins` | Superuser/HR | Today's blocked check-ins |
| `GET` | `/api/attendance/security-policies/my` | Session | Policy for current user's role |

### Modified Routes

| Route | File | Modification |
|---|---|---|
| `POST /api/login` | `auth.ts` | Add: lockout, device trust, network check, login audit |
| `POST /api/reset-password` | `auth.ts` | Add: session invalidation, device revocation option |
| `POST /api/change-password` | `auth.ts` | Add: other-session invalidation, reauth clear |
| `POST /api/attendance/check-in` | `attendance-routes.ts` | Full policy-driven pipeline |
| `POST /api/admin/payroll/increment-proposals/:id/approve` | `admin-routes.ts` | Add: `requireReauth('payroll.approve_increment')` |
| `POST /api/payroll/run/official` | `payroll-run-engine.ts` | Add: `requireReauth('payroll.run_official')` |
| `PUT /api/admin/users/:id` | `admin-routes.ts` | Add: role/bank/salary re-auth |
| `POST /api/users/:userId/module-permissions/:moduleName` | `module-permission-routes.ts` | Add: `requireReauth` |
| `DELETE /api/users/:userId/module-permissions/:moduleName` | `module-permission-routes.ts` | Add: `requireReauth` |
| `POST /api/epc-permissions/change-requests/:id/apply` | `epc-permission-routes.ts` | Add: `requireReauth` |
| `POST /api/2fa/disable` | `two-factor-routes.ts` | Add: `requireReauth`, session invalidation |

---

## Section 3 — Security Policies

### Login Security Policy Defaults

| Level | Roles | 2FA | Device Trust | Session | Lockout | Reauth Timeout |
|---|---|---|---|---|---|---|
| `high_security` | Superuser, GM, SM | Mandatory | Yes | 8 hours | 3 attempts → 60 min | 15 min |
| `elevated` | Manager, Senior Executive | Mandatory (modules) | No | 12 hours | 5 attempts → 30 min | 30 min |
| `standard` | Employee | Optional | No | 24 hours | 5 attempts → 15 min | 60 min |

### Attendance Security Policy Defaults (all advisory initially)

| Mode | Roles (default) | Effective Mode at Deployment |
|---|---|---|
| `exempt` | Superuser, GM, SM | Exempt (permanent) |
| `advisory` | Manager | Advisory → may upgrade to enforced later |
| `enforced` | Employee, Senior Executive | **Advisory until Phase 7** |

### Sensitive Action Policy Defaults

| Action | Roles | Challenge | Timeout |
|---|---|---|---|
| `payroll.run_official` | Superuser | totp | 0 (always) |
| `payroll.lock_period` | Superuser | totp | 0 (always) |
| `payroll.approve_increment` | All | any | 15 min |
| `salary.update_bank_details` | All | password | 0 (always) |
| `salary.update_base` | All | any | 15 min |
| `user.change_role` | Superuser | totp | 0 (always) |
| `user.change_permissions` | Superuser | any | 15 min |
| `user.disable_2fa` | Superuser | totp | 0 (always) |
| `user.reset_2fa` | Self | password | 0 (always) |
| `security.update_login_policy` | Superuser | totp | 0 (always) |
| `security.update_attendance_policy` | Superuser | totp | 0 (always) |
| `security.update_2fa_policy` | Superuser | totp | 0 (always) |
| `security.revoke_session` | Superuser | any | 30 min |
| `security.grant_device_trust` | Superuser | totp | 0 (always) |
| `security.force_logout` | Superuser | totp | 0 (always) |

---

## Section 4 — Audit Log Governance

### Retention Schedule

| Log | Hot (PostgreSQL) | Archive (GCS) | Total |
|---|---|---|---|
| `login_audit_log` | 2 years | +5 years | 7 years |
| `reauth_audit_log` | 1 year | +4 years | 5 years |
| `trusted_device_audit_log` | 2 years | +3 years | 5 years |
| `attendance_location_audit_log` | 3 years | +4 years | 7 years |
| `security_emergency_log` | Permanent | GCS copy at write | Never deleted |
| `two_factor_audit_log` | 2 years | +3 years | 5 years |
| `two_fa_policy_audit_log` | Permanent | GCS copy after 2 years | Never deleted |

### Access Control Summary

| Log | View | Export |
|---|---|---|
| `login_audit_log` | Superuser (all), HR (own users) | Superuser only |
| `reauth_audit_log` | Superuser only | Superuser only |
| `trusted_device_audit_log` | Superuser (all), self (own) | Superuser only |
| `attendance_location_audit_log` | Superuser, HR, Manager (reports), self | Superuser, HR |
| `security_emergency_log` | Superuser only | Superuser only |
| `two_factor_audit_log` | Superuser (all), self (own) | Superuser only |
| `two_fa_policy_audit_log` | Superuser only | Superuser only |

### Governance Rules (Non-Negotiable)

- C-01: Append-only — no DELETE/UPDATE except archival transition
- C-02: Superuser actions always logged in same DB transaction
- C-03: `security_emergency_log` never deleted
- C-04: `storage.invalidateUserSessions()` always logs before returning
- C-05: Minimum hot retention honoured — no automated PostgreSQL deletion
- C-06: All re-auth events logged — success, failure, cancel, reuse
- C-07: Policy changes logged in same transaction as change
- C-08: GCS archive SHA-256 checksum verified on every restore
- C-09: Log exports require re-auth and produce an audit row
- C-10: Audit write failure causes parent action failure — no silent swallow

---

## Section 5 — Emergency Recovery

### Break-Glass Script

`scripts/emergency-recovery.ts` — shell-only, never an HTTP endpoint.

Requirements:
- `EMERGENCY_RECOVERY_PASSPHRASE` in Replit Secrets
- 3-attempt lockout on wrong passphrase
- Dual-control attestation (Scenario 3/4)
- Pre- and post-action rows in `security_emergency_log`
- Email notification to all Superusers after every run

### Recovery Scenarios

| Scenario | Path |
|---|---|
| Lost trusted device (other Superuser available) | `POST /api/admin/users/:id/devices/grant` (TOTP re-auth) |
| Lost 2FA device (backup codes available) | Existing backup code flow |
| Lost 2FA + all backup codes | Break-glass script — dual control required |
| All Superusers locked out | Break-glass script — dual control required |

---

## Section 6 — Rollout Plan Reference

See Revision 5 architecture document (chat record 09 May 2026) for:
- 8-phase deployment sequence
- Feature flag definitions and rollback SQL per phase
- Production go-live checklist
- Rollback decision criteria
- Runtime monitoring thresholds

---

## Section 7 — Verification Tests Reference

All verification tests are defined in the architecture chat record. Test IDs:
- **Plane A (Application Security)**: T-A01–T-A08
- **Trusted Devices**: T-D01–T-D09
- **Re-Authentication**: T-R01–T-R11
- **Plane B (Attendance Security)**: T-B01–T-B13
- **Payroll Alignment**: T-P01–T-P04
- **Emergency Recovery**: T-E01–T-E09
- **Forced Global Logout**: T-G01–T-G08
- **Password Reset Security**: T-PR01–T-PR08
- **Password Manager**: T-PM01–T-PM09
- **Audit Log Governance**: T-AL01–T-AL15
- **Compliance/Forensic**: T-CF01–T-CF05
- **2FA Administration**: T-2F01–T-2F15
- **Rollout/Rollback**: T-RO01–T-RO20 (Revision 5)

---

## Section 8 — Acceptance Criteria

All 33 acceptance criteria from Revision 4 are in force. Implementation is complete only when all criteria pass and all verification tests pass.

---

## Zero-Trust Audit Procedure

After implementation is complete, the following zero-trust audit must be performed before this baseline is closed:

1. `grep -rn "DELETE FROM.*audit\|UPDATE.*audit" server/` → must return zero results for all security log tables
2. `grep -rn "payroll-salary-core" server/` → confirm no changes to that file
3. Direct SQL: attempt DELETE on each audit log table → must be rejected by trigger
4. Run full verification test suite (T-A01 through T-RO20)
5. Verify nightly archival job produces GCS files with valid checksums
6. Verify emergency recovery script runs successfully in staging
7. Verify all Superuser emails receive emergency notification
8. Confirm `EMERGENCY_RECOVERY_PASSPHRASE` is set in Replit Secrets
9. Confirm `TWO_FACTOR_ENCRYPTION_KEY` is set in Replit Secrets
10. Sign off: Implementation lead + THERMOPAC MD/IT Head

Results recorded in: `docs/security-baseline-v1.0-audit-evidence.md` (created after implementation)

---

## Deviation Approval Process

Any change to this baseline after approval requires:

1. Written description of the proposed deviation
2. Impact assessment (which tests are affected, which tables/routes change)
3. Approval by THERMOPAC MD or IT Head
4. New version of this baseline document (`security-baseline-v1.1.md`)
5. Updated zero-trust audit evidence
6. Entry in `security_emergency_log` if the deviation is security-critical

No implementation deviation is permitted without a new approved baseline version.

---

*End of Baseline v1.0*
