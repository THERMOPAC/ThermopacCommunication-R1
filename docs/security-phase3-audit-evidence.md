# Security Phase 3 — Re-Authentication Middleware
## Audit Evidence & Verification Report

**Date:** 2026-05-09  
**Status:** COMPLETE — 20/20 checks passed  
**Feature flag:** `SECURITY_REAUTH_ENABLED = true` (live)  
**Baseline ref:** `docs/security-baseline-v1.0.md` / `docs/security-phase3-preapproval.md`

---

## 1. Files Created / Modified

### New Files
| File | Purpose |
|------|---------|
| `server/middleware/require-reauth.ts` | `requireReauth(actionKey)` middleware factory + `checkReauth()` inline helper + `writeReauthAudit()` utility |
| `server/security-routes.ts` | `POST /api/security/reauth` — credential verification (password / TOTP / any) + session token write |
| `client/src/components/reauth-dialog.tsx` | Radix UI modal — handles password, TOTP, and "any" challenge types with tabbed UI |
| `client/src/hooks/use-reauth.ts` | `useReauthMutation` hook + `triggerReauth` global dispatch + `parseReauthError` helper |

### Modified Files
| File | Change |
|------|--------|
| `server/routes.ts` | Import + register `registerSecurityRoutes(app)` |
| `server/admin-routes.ts` | `requireReauth('payroll.approve_increment')` on POST increment-proposals approve; conditional `checkReauth` on PUT /users/:id for role/salary/bank fields |
| `server/payroll-routes.ts` | `requireReauth('payroll.run_official')` on POST /run/start |
| `server/module-permission-routes.ts` | `requireReauth('user.change_permissions')` on POST and DELETE /module-permissions/:moduleName |
| `server/epc-permission-routes.ts` | `requireReauth('user.change_permissions')` on POST change-requests/:id/apply |
| `server/two-factor-routes.ts` | `requireReauth('user.disable_2fa')` on POST /disable |
| `client/src/App.tsx` | Mount `<ReauthDialog />` inside `AuthProvider` (singleton, always rendered) |

---

## 2. Architecture

### Middleware Flow
```
Request → ensureAuthenticated → requireReauth(actionKey) → route handler
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │ flag disabled           │ valid token in session  │ no valid token
              ↓                         ↓                         ↓
           next()              consume(if timeout=0)      write audit(required)
                                write audit(reused)       → 403 { code: REAUTH_REQUIRED,
                                   → next()                 actionKey, challengeType,
                                                            timeoutMinutes }
```

### Re-Auth Flow (Frontend)
```
API call → 403 REAUTH_REQUIRED → ReauthDialog opens
   ↓
User submits credential → POST /api/security/reauth
   ↓
Server verifies (password/TOTP) → writes audit(passed) → stores session token
   ↓
Dialog onSuccess → original API call retried automatically
```

### Session Token Shape
```typescript
req.session.reauthTokens[actionKey] = {
  at: number;          // Unix ms timestamp of verification
  challengeType: string;  // 'password' | 'totp'
  consumed?: boolean;  // true after first use (timeout=0 actions only)
}
```

### Single-Use Actions (timeout=0)
Token valid within 60s grace window AND `consumed === false`. After one successful pass-through, `consumed = true` — action must be re-authenticated next time.

---

## 3. Sensitive Action Policies (15 seeded)

| Action Key | Challenge | Timeout | Use |
|------------|-----------|---------|-----|
| `payroll.run_official` | any | 30 min | POST /api/payroll/run/start |
| `payroll.lock_period` | password | 30 min | (future) |
| `payroll.approve_increment` | any | 30 min | POST /api/admin/payroll/increment-proposals/:id/approve |
| `salary.update_bank_details` | any | 30 min | PUT /api/admin/users/:id (bank fields) |
| `salary.update_base` | password | 30 min | PUT /api/admin/users/:id (salary fields) |
| `user.change_role` | any | **0** (single-use) | PUT /api/admin/users/:id (role field) |
| `user.change_permissions` | any | 30 min | POST/DELETE /module-permissions, POST /change-requests/:id/apply |
| `user.disable_2fa` | any | **0** (single-use) | POST /api/2fa/disable |
| `user.reset_2fa` | any | **0** (single-use) | (future) |
| `security.update_login_policy` | any | **0** (single-use) | (future) |
| `security.update_attendance_policy` | password | 30 min | (future) |
| `security.update_2fa_policy` | any | **0** (single-use) | (future) |
| `security.revoke_session` | any | 30 min | (future) |
| `security.grant_device_trust` | any | 30 min | (future) |
| `security.force_logout` | any | **0** (single-use) | (future) |

---

## 4. C-10 Compliance (Audit Write Failure = Action Blocked)

Every `requireReauth` / `checkReauth` call wraps `writeReauthAudit()` in a `try/catch` that returns `500` on failure. The action is **blocked** — not silently permitted — if the audit trail cannot be written.

---

## 5. Verification Results (20/20 PASSED)

| Check ID | Description | Result |
|----------|-------------|--------|
| ZT-P3-01 | Policy: payroll.run_official seeded + active | PASS |
| ZT-P3-02 | Policy: payroll.approve_increment seeded + active | PASS |
| ZT-P3-03 | Policy: salary.update_bank_details seeded + active | PASS |
| ZT-P3-04 | Policy: user.change_role is single-use (timeout=0) | PASS |
| ZT-P3-05 | Policy: user.disable_2fa is single-use (timeout=0) | PASS |
| ZT-P3-06 | Policy: user.reset_2fa is single-use (timeout=0) | PASS |
| ZT-P3-07 | Policy: security.force_logout is single-use (timeout=0) | PASS |
| ZT-P3-08 | Total active policies = 15 | PASS |
| ZT-P3-09 | Single-use (timeout=0) policies = 6 | PASS |
| ZT-P3-10 | SECURITY_REAUTH_ENABLED flag = true | PASS |
| ZT-P3-11 | reauth_audit_log has user_id column | PASS |
| ZT-P3-12 | reauth_audit_log has outcome column | PASS |
| ZT-P3-13 | reauth_audit_log has severity column | PASS |
| ZT-P3-14 | reauth_audit_log has archived_at column (archival support) | PASS |
| ZT-P3-15 | server/middleware/require-reauth.ts exists | PASS |
| ZT-P3-16 | server/security-routes.ts exists | PASS |
| ZT-P3-17 | client/src/components/reauth-dialog.tsx exists | PASS |
| ZT-P3-18 | client/src/hooks/use-reauth.ts exists | PASS |
| ZT-P3-19 | admin-routes.ts: requireReauth imported + applied | PASS |
| ZT-P3-20 | payroll-routes.ts: requireReauth('payroll.run_official') on /run/start | PASS |

---

## 6. API Smoke Tests

| Test | Expected | Result |
|------|----------|--------|
| POST /api/payroll/run/start (no session) | 401 Unauthorized | PASS |
| POST /api/security/reauth (no session) | 401 Not authenticated | PASS |
| POST /api/admin/payroll/increment-proposals/999/approve (no session) | 401 Unauthorized | PASS |

---

## 7. Deviations from Baseline

None. Implementation follows `docs/security-phase3-preapproval.md` exactly.

---

*Generated by automated Phase 3 verification suite.*
