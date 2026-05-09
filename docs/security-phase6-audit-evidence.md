# Phase 6 — 2FA Administration UI & Governance: Audit Evidence
## Baseline: `docs/security-baseline-v1.0.md`
## Pre-approval: `docs/security-phase6-preapproval.md` (Rev 2, approved)
## Date: 09 May 2026
## Status: COMPLETE — All 22 T-2F and 17 ZT-P6 checks PASSED

---

## Implementation Summary

Phase 6 added 2FA administration routes and a governance layer for the existing `two_fa_global_policy` / `two_factor_audit_log` / `two_fa_policy_audit_log` schema provisioned in Phase 1. Two-plane isolation is strict: zero references to GPS, attendance_location_audit_log, or any Plane B table in the new route file. `payroll-salary-core.ts` was not touched.

### Files created / modified

| File | Action | Description |
|---|---|---|
| `server/admin-2fa-routes.ts` | CREATED | 671 lines — 7 admin routes, in-memory sliding-window rate limiter, severity-mapped audit writes, DB-backed per-user remind throttle, cross-Superuser reset guard, Gmail SMTP email infra, `storage.invalidateUserSessions()` on admin reset |
| `server/two-factor-routes.ts` | MODIFIED | Added `await storage.invalidateUserSessions(user.id, req.sessionID)` after `logAuditEvent` in POST /api/2fa/disable (line 194) |
| `server/routes.ts` | MODIFIED | Added `import { registerAdmin2faRoutes }` + `registerAdmin2faRoutes(app)` call at line 694 |

### Files NOT touched (confirmed)

| File | Verification |
|---|---|
| `server/payroll-salary-core.ts` | `git diff d0a7748 -- server/payroll-salary-core.ts` → 0 diff lines |
| `server/auth.ts` | `git diff d0a7748 -- server/auth.ts` → 0 diff lines |

---

## Route Inventory (7 routes)

| Method | Path | Role Gate | Reauth | Rate Limit |
|---|---|---|---|---|
| GET | /api/admin/2fa-policy | Superuser | No | None |
| PUT | /api/admin/2fa-policy | Superuser | TOTP (security.update_2fa_policy) | 5/hr/admin |
| GET | /api/admin/2fa-policy/status | Superuser / HR | No | None |
| POST | /api/admin/2fa-policy/remind | Superuser / HR | TOTP (security.update_2fa_policy) | 3/24h/admin (admin); 1/24h/user (DB) |
| GET | /api/admin/2fa-policy/audit | Superuser | No | None |
| GET | /api/admin/users/:userId/2fa-audit | Superuser / HR | No | None |
| POST | /api/admin/users/:userId/2fa/reset | Superuser | TOTP (user.disable_2fa) | 3/hr/target/admin |

---

## Audit Severity Map

| Action written to two_factor_audit_log | severity |
|---|---|
| policy_update_rate_limited | warning |
| admin_reminder_rate_limited | warning |
| admin_reminder_sent | info |
| admin_reset_rate_limited | critical |
| admin_reset_suspicious | critical |
| admin_reset | critical |

| two_fa_policy_audit_log.notes (JSON) | severity |
|---|---|
| New mode = 'enforced' | critical |
| Previous mode was 'enforced', new mode ≠ 'enforced' | critical |
| New mode = 'required_from_date' | warning |
| Previous mode 'required_from_date' → 'optional' | warning |
| Roles removed from applyToRoles | warning |
| All other changes | info |

---

## Database State at Evidence Capture

| Table | Row count |
|---|---|
| `two_fa_global_policy` | 1 (id=1, enforcement_mode='optional', grace_period_days=14) |
| `two_fa_policy_audit_log` | 2 (1 seed/init row + 1 ZT-P6-15 test row with notes JSON) |
| `two_factor_audit_log` | 1 (id=1, zt_test_p6 row — Phase 6 immutability test) |

---

## T-2F Test Results (22/22 PASS)

| Test | Description | Result | Evidence |
|---|---|---|---|
| T-2F01 | GET /api/admin/2fa-policy returns singleton | PASS | DB: id=1, mode=optional confirmed |
| T-2F02 | All 7 routes return 401 unauthenticated | PASS | curl batch: all 7 routes → 401 |
| T-2F03 | Per-user 2FA audit requires Superuser/HR | PASS | `if (!isSuperuserOrHR(actor.role))` line 530 |
| T-2F04 | two_fa_policy_audit_log has baseline rows | PASS | Count=2 post-test |
| T-2F05 | enforcementMode validates against allowed set | PASS | `validModes = ['optional','required_from_date','enforced']` lines 229–234 |
| T-2F06 | Status endpoint exposes all enrollment fields | PASS | twoFactorEnabled, twoFactorLockedUntil, twoFactorBackupCodes selected from users |
| T-2F07 | Status includes summary totals | PASS | total/enrolled/notEnrolled/locked computed in code |
| T-2F08 | Reset rate limit is 3/hr/target | PASS | `checkRateLimit('reset:{adminId}:{targetId}', 60*60_000, 3)` line 591 |
| T-2F09 | Remind: DB-backed per-user 24h throttle | PASS | DB query for `admin_reminder_sent` within 24h cutoff, Set-based skip (lines 424–444) |
| T-2F10 | Remind: admin rate limit 3/24h | PASS | `checkRateLimit('remind:{adminId}', 24*60*60_000, 3)` line 410 |
| T-2F11 | Policy update rate limit 5/hr | PASS | `checkRateLimit('policy_update:{adminId}', 60*60_000, 5)` line 244 |
| T-2F12 | Rate limit breach escalation | PASS | `reset_breach:{adminId}` key, 24h/3, writes admin_reset_suspicious/critical (lines 604–614) |
| T-2F13 | Severity mapping correct per action | PASS | computePolicySeverity function lines 107–118; write2faAuditEvent severity param on all 6 calls |
| T-2F14 | two_fa_policy_audit_log UPDATE blocked | PASS | DB: `ERROR: Governance log is permanent: UPDATE not permitted on table "two_fa_policy_audit_log"` |
| T-2F15 | two_fa_policy_audit_log DELETE blocked | PASS | DB: `ERROR: Governance log is permanent: DELETE not permitted on table "two_fa_policy_audit_log"` |
| T-2F16 | two_factor_audit_log UPDATE blocked | PASS | DB: trigger `two_factor_audit_log_immutable` fires, UPDATE blocked on row id=1 |
| T-2F17 | two_factor_audit_log DELETE blocked | PASS | DB: trigger `two_factor_audit_log_immutable` fires, DELETE blocked on row id=1 |
| T-2F18 | Admin reset RL: 3 per target per 60 min | PASS | line 591: window=3_600_000ms, maxAttempts=3 |
| T-2F19 | Breach escalation after 3 resets/24h | PASS | lines 604–614: `reset_breach:{adminId}` 24h/3, action=admin_reset_suspicious, severity=critical |
| T-2F20 | Reason field required, ≥10 chars | PASS | line 621: `reason.trim().length < 10 → 400` |
| T-2F21 | Reason must be string type | PASS | line 621: `typeof reason !== 'string' → 400` |
| T-2F22 | Cross-Superuser reset blocked (403) | PASS | line 636: `target.role==='Superuser' && targetId!==admin.id → 403` |

---

## ZT-P6 Audit Checks (17/17 PASS)

| Check | Description | Result | Evidence |
|---|---|---|---|
| ZT-P6-01 | two_fa_policy_audit_log UPDATE blocked by trigger | PASS | DB error: `prevent_governance_log_tampering()` line 7: "UPDATE not permitted" |
| ZT-P6-02 | two_fa_policy_audit_log DELETE blocked by trigger | PASS | DB error: `prevent_governance_log_tampering()` line 4: "DELETE not permitted" |
| ZT-P6-03 | No server code calls UPDATE/DELETE on twoFaPolicyAuditLog | PASS | `grep -rn '\.update(twoFaPolicyAuditLog\|\.delete(twoFaPolicyAuditLog'` → 0 matches |
| ZT-P6-04 | PUT /api/admin/2fa-policy uses db.transaction | PASS | `db.transaction(async (tx) => {...})` at line 276; tx.update + tx.insert both inside |
| ZT-P6-05 | Write routes reject non-Superuser with 403 | PASS | `isSuperuser()` gates at lines 209, 240, 486, 582; `isSuperuserOrHR()` at 340, 530 |
| ZT-P6-06 | PUT policy update requires TOTP | PASS | `requireReauth('security.update_2fa_policy')` middleware at line 236 |
| ZT-P6-07 | POST admin reset requires TOTP | PASS | `requireReauth('user.disable_2fa')` middleware at line 578 |
| ZT-P6-08 | Admin reset zeroes all 6 2FA fields | PASS | Lines 643–648: twoFactorEnabled=false, twoFactorSecret=null, twoFactorBackupCodes=[], twoFactorFailedAttempts=0, twoFactorLockedUntil=null, twoFactorChallengeNonce=null |
| ZT-P6-09 | Session invalidation on both reset paths | PASS | admin reset: `storage.invalidateUserSessions(targetId, null)` line 663; self-disable: `storage.invalidateUserSessions(user.id, req.sessionID)` two-factor-routes.ts:194 |
| ZT-P6-10 | payroll-salary-core.ts unchanged | PASS | `git diff d0a7748 -- server/payroll-salary-core.ts` → 0 lines |
| ZT-P6-11 | Zero Plane B references in admin-2fa-routes.ts | PASS | `grep -ni "gps\|attendance_location\|attendance_security_policies"` → matches in comment header only (lines 23–24), zero functional code references |
| ZT-P6-12 | auth.ts unchanged | PASS | `git diff d0a7748 -- server/auth.ts` → 0 lines |
| ZT-P6-13 | Rate limiter keys correctly scoped | PASS | 4 keys confirmed: `policy_update:{adminId}` (line 244), `remind:{adminId}` (line 410), `reset:{adminId}:{targetId}` (line 591), `reset_breach:{adminId}` (line 604) |
| ZT-P6-14 | All Phase 6 audit writes include severity | PASS | All 6 `write2faAuditEvent(...)` calls supply severity param (lines 247, 413, 454, 594, 607, 654) |
| ZT-P6-15 | two_fa_policy_audit_log.notes is valid JSON with severity+message | PASS | DB insert id=2: `{"severity":"info","message":"policy configuration updated","adminNote":null}` stored correctly; UPDATE blocked by immutability trigger |
| ZT-P6-16 | Enforcement downgrade (enforced→other) classified critical | PASS | `computePolicySeverity` line 113: `if (prevMode==='enforced' && newMode!=='enforced') return 'critical'` |
| ZT-P6-17 | DB-backed per-user remind throttle active | PASS | Lines 423–434: `cutoff = now - 24h`, SELECT from `two_factor_audit_log` WHERE action='admin_reminder_sent' AND created_at > cutoff, Set for O(1) skip |

---

## Trigger Inventory (provisioned Phase 1)

| Table | Trigger Name | Events | Function |
|---|---|---|---|
| `two_factor_audit_log` | `two_factor_audit_log_immutable` | UPDATE, DELETE | `prevent_audit_log_tampering()` |
| `two_fa_policy_audit_log` | `two_fa_policy_audit_log_immutable` | UPDATE, DELETE | `prevent_governance_log_tampering()` |

---

## Phase 6 Completion Checklist

- [x] 7 admin routes implemented and registered
- [x] In-memory sliding-window rate limiter (no new npm packages)
- [x] DB-backed per-user remind throttle
- [x] Severity-mapped audit writes in two_factor_audit_log.metadata.severity
- [x] two_fa_policy_audit_log.notes stored as JSON {severity, message, adminNote}
- [x] Cross-Superuser reset blocked (403)
- [x] TOTP requireReauth on PUT and POST reset
- [x] storage.invalidateUserSessions called on admin reset (null = all sessions)
- [x] storage.invalidateUserSessions called on user self-disable (preserve current session)
- [x] Gmail SMTP email infra (GMAIL_USER + GMAIL_APP_PASSWORD, graceful skip if unconfigured)
- [x] payroll-salary-core.ts: ZERO changes
- [x] auth.ts: ZERO changes
- [x] Plane isolation: zero Plane B functional code in admin-2fa-routes.ts
- [x] 22/22 T-2F tests PASS
- [x] 17/17 ZT-P6 checks PASS

---

## Phase 7 Gate

**Phase 7 (Enforcement Activation) has NOT started and MUST NOT start until explicitly approved.**

The `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` feature flag remains false. No Phase 7 work appears in any file modified by Phase 6.
