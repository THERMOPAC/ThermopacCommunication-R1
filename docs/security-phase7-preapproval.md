# Phase 7 — Attendance Enforcement: Pre-Approval
## Baseline: `docs/security-baseline-v1.0.md`
## Date: 09 May 2026
## Status: AWAITING APPROVAL

---

## Risk Classification

**HIGH** — This phase directly blocks employee check-ins. A mis-configured policy or a bug in the enforcement branch can prevent legitimate staff from clocking in. Feature flag provides instant rollback (< 1 minute), but operational disruption is possible if not carefully sequenced.

**Baseline constraint (non-negotiable):** 7-day advance notice to all affected employees (Senior Executive, Employee roles) is required before `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` is set to `true` in production. Technical implementation may proceed; the flag is only enabled after the notice period has elapsed.

---

## What Phase 7 Does

Converts the advisory attendance pipeline (Phase 5) into an enforcement pipeline for the `enforced` policy tier. When `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = true` and a user's role maps to a policy with `policy_mode = 'enforced'`, a failing check-in is **rejected with HTTP 403** and the attendance record is **not written**. Advisory and exempt tiers are unchanged.

---

## Current State (entering Phase 7)

| Item | State |
|---|---|
| `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` | `false` |
| `advisory_standard` policy (SE, Employee) | `policy_mode = 'advisory'` |
| `advisory_manager` policy (Manager) | `policy_mode = 'advisory'` — **stays advisory** |
| `exempt_policy` (Superuser, GM, SM) | `policy_mode = 'exempt'` — **unchanged** |
| `GET /api/attendance/blocked-checkins` | Stub — always empty |
| `attendance_location_audit_log.blocked` | Column **does not exist** — must be added |

---

## Scope — Exactly What Changes

### 1. Schema (DDL via executeSql — no drizzle-kit)

**Add column** to `attendance_location_audit_log`:

```sql
ALTER TABLE attendance_location_audit_log
  ADD COLUMN blocked boolean NOT NULL DEFAULT false;
```

No new tables. No other schema changes.

### 2. `server/attendance-security-service.ts` — MODIFIED

**Change 1** — `AttendanceAuditResult` type: `blocked: false` → `blocked: boolean`

**Change 2** — Add enforcement branch at Step 8 (outcome determination). Logic:

```
IF SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = true AND policyMode = 'enforced':
  For each failing condition → outcome = 'enforced_blocked_{reason}', blocked = true
  If all conditions pass → outcome = 'enforced_allowed_ok', blocked = false
ELSE (advisory or flag off):
  Existing advisory_ outcomes, blocked = false (unchanged)
```

Outcome string mapping:

| Advisory outcome (Phase 5) | Enforced outcome (Phase 7, enforced tier) | blocked |
|---|---|---|
| `advisory_gps_denied` | `enforced_blocked_gps_required` | true |
| `advisory_gps_unavailable` | `enforced_blocked_gps_required` | true |
| `advisory_gps_timeout` | `enforced_blocked_gps_required` | true |
| `advisory_gps_not_supported` | `enforced_blocked_gps_required` | true |
| `advisory_spoofing_detected` | `enforced_blocked_spoofing` | true |
| `advisory_outside_geofence` | `enforced_blocked_outside_geofence` | true |
| `advisory_low_accuracy` | `enforced_blocked_low_accuracy` | true |
| `advisory_ip_unverified` | `enforced_blocked_ip_unverified` | true |
| `advisory_ok` | `enforced_allowed_ok` | false |

**Change 3** — `writeAuditRow` helper: pass and write the `blocked` boolean to `attendance_location_audit_log.blocked`.

**Change 4** — When `blocked = true`, the `attendanceRecordId` is null (record not yet written — it is blocked before write). The audit row is written first, then the block is returned. This satisfies C-10 (audit write failure causes parent failure).

### 3. `server/attendance-routes.ts` — MODIFIED

After the audit pipeline call, add enforcement gate **before** writing the attendance record:

```
if (auditResult.blocked === true) {
  return res.status(403).json({
    error: 'Check-in blocked by attendance security policy',
    reason: auditResult.outcome,
    auditId: auditResult.auditId,
    distanceToOfficeMeters: auditResult.distanceToOfficeMeters,
  });
}
```

The attendance record (`attendance_records`) is **not written** when blocked. The audit row is already written.

### 4. `server/attendance-security-routes.ts` — MODIFIED

Replace the `GET /api/attendance/blocked-checkins` stub with a real query:

- Returns `attendance_location_audit_log` rows where `blocked = true` and `created_at >= start of today (IST)`
- Superuser/HR only (existing role gate unchanged)
- Paginated (default 50, max 200)
- Joins to `users` for username + role
- Response: `{ rows, total, date }`

### 5. DB changes (sequenced)

**Step A — before flag enable (safe to run anytime):**
```sql
-- Add blocked column (Step 1 above)
ALTER TABLE attendance_location_audit_log ADD COLUMN blocked boolean NOT NULL DEFAULT false;

-- Switch advisory_standard → enforced (no effect until flag is enabled)
UPDATE attendance_security_policies
SET policy_mode = 'enforced', updated_at = NOW()
WHERE policy_name = 'advisory_standard';
```

**Step B — after 7-day notice period, to go live:**
```sql
UPDATE epc_migration_feature_flags
SET enabled = true, updated_at = NOW()
WHERE flag_name = 'SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED';
```

**Rollback (immediate):**
```sql
UPDATE epc_migration_feature_flags
SET enabled = false, updated_at = NOW()
WHERE flag_name = 'SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED';
```
Rollback restores advisory mode instantly. No data migration needed. No attendance records are retroactively affected.

---

## Files Changed

| File | Action | Change Description |
|---|---|---|
| `server/attendance-security-service.ts` | MODIFIED | Enforcement branch in Step 8; `blocked` boolean in result + audit write |
| `server/attendance-routes.ts` | MODIFIED | Post-audit enforcement gate; 403 before record write |
| `server/attendance-security-routes.ts` | MODIFIED | `GET /api/attendance/blocked-checkins` stub → real query |
| `shared/schema.ts` | MODIFIED | Add `blocked` column to `attendanceLocationAuditLog` table definition |
| DDL | executeSql | `ALTER TABLE attendance_location_audit_log ADD COLUMN blocked boolean` |
| DB row | executeSql | `advisory_standard.policy_mode = 'enforced'` |
| DB row | executeSql | `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = true` (Step B only) |

**Not touched:**
- `payroll-salary-core.ts` — zero changes, non-negotiable
- `auth.ts` — zero changes (Plane A/B isolation)
- `two-factor-routes.ts` — zero changes
- `admin-2fa-routes.ts` — zero changes
- Any Plane A file

---

## Verification Tests — T-P7-01 through T-P7-16

| ID | Test | Expected |
|---|---|---|
| T-P7-01 | Exempt role (Superuser) check-in with GPS denied | 200 — `outcome=exempt`, `blocked=false` |
| T-P7-02 | Advisory role (Manager) check-in outside geofence | 200 — `outcome=advisory_outside_geofence`, `blocked=false` |
| T-P7-03 | Enforced role check-in outside geofence | 403 — `outcome=enforced_blocked_outside_geofence`, attendance record not written |
| T-P7-04 | Enforced role check-in within geofence, accurate GPS | 200 — `outcome=enforced_allowed_ok`, record written |
| T-P7-05 | Enforced role check-in with GPS status `denied` | 403 — `outcome=enforced_blocked_gps_required` |
| T-P7-06 | Enforced role check-in with GPS status `unavailable` | 403 — `outcome=enforced_blocked_gps_required` |
| T-P7-07 | Enforced role check-in with spoofing flag detected | 403 — `outcome=enforced_blocked_spoofing` |
| T-P7-08 | Enforced role check-in with low GPS accuracy | 403 — `outcome=enforced_blocked_low_accuracy` |
| T-P7-09 | `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = false`, enforced role outside geofence | 200 — advisory mode, `blocked=false` |
| T-P7-10 | After rollback flag set to false — all enforced-role check-ins pass again | 200 |
| T-P7-11 | Blocked check-in writes audit row with `blocked=true` | DB: `attendance_location_audit_log.blocked = true` |
| T-P7-12 | Allowed check-in writes audit row with `blocked=false` | DB: `attendance_location_audit_log.blocked = false` |
| T-P7-13 | Blocked check-in: attendance record not written | DB: no `attendance_records` row for blocked attempt |
| T-P7-14 | `GET /api/attendance/blocked-checkins` returns today's blocked rows | `rows.length >= 1` after a block |
| T-P7-15 | `GET /api/attendance/blocked-checkins` returns 401 unauthenticated | 401 |
| T-P7-16 | `GET /api/attendance/blocked-checkins` returns 403 for Manager role | 403 |

---

## Zero-Trust Audit Checks — ZT-P7-01 through ZT-P7-10

| ID | Check | Method |
|---|---|---|
| ZT-P7-01 | `payroll-salary-core.ts` unchanged | `git diff Phase6checkpoint -- server/payroll-salary-core.ts` → 0 lines |
| ZT-P7-02 | No GPS/geofence references in Plane A files | `grep -rn "latitude\|longitude\|geofence\|gpsAccuracy" server/auth.ts server/admin-2fa-routes.ts` → 0 |
| ZT-P7-03 | Audit row written before 403 returned (C-10) | Code inspection: `writeAuditRow()` called before `return res.status(403)` |
| ZT-P7-04 | Blocked check-in audit row is immutable | SQL `UPDATE attendance_location_audit_log SET blocked=false WHERE blocked=true` → trigger blocks |
| ZT-P7-05 | Exempt roles never appear in blocked-checkins | DB: `SELECT COUNT(*) FROM attendance_location_audit_log WHERE blocked=true AND user_id IN (Superuser IDs)` → 0 |
| ZT-P7-06 | Advisory roles never appear in blocked-checkins | DB: same query for Manager IDs → 0 |
| ZT-P7-07 | Flag toggle verified: false → advisory, true → enforced | Flip flag, re-run T-P7-09, then flip back and re-run T-P7-03 |
| ZT-P7-08 | Rollback SQL tested: enforcement disabled in < 60s | Timed rollback SQL execution |
| ZT-P7-09 | `blocked-checkins` route role gate (Superuser/HR only) | curl as unauthenticated → 401; curl as Manager → 403 |
| ZT-P7-10 | `advisory_standard.policy_mode = 'enforced'` in DB | `SELECT policy_mode FROM attendance_security_policies WHERE policy_name='advisory_standard'` |

---

## Implementation Sequence

1. **Code changes** — `attendance-security-service.ts`, `attendance-routes.ts`, `attendance-security-routes.ts`, `shared/schema.ts`
2. **DDL** — `ALTER TABLE` (Step A) — safe; existing rows get `blocked = false` by default
3. **Policy flip** — `advisory_standard → enforced` (Step A) — safe; flag still false, no enforcement active
4. **Verification run** — T-P7-01 through T-P7-16 with flag still false (advisory mode tests only)
5. **7-day clock starts** — notify all Employee and Senior Executive users
6. **Flag enable** — Step B, after 7-day period
7. **Full verification** — all 16 tests + 10 ZT checks with flag true
8. **Evidence document** — `docs/security-phase7-audit-evidence.md`

---

## What This Phase Does NOT Include

- No change to IP verification logic (already wired in advisory pipeline)
- No change to check-out flow (enforcement is check-in only, per baseline)
- No change to Manager policy (remains advisory)
- No new feature flags beyond enabling the existing one
- No npm packages
- No payroll integration

---

## Approval Required Before Implementation

- [ ] Approved by THERMOPAC Management
- [ ] 7-day employee notice plan confirmed
- [ ] Rollback owner identified (person with DB access to run rollback SQL)

*Implementation starts only after all three boxes are checked.*
