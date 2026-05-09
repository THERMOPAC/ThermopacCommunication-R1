# Security Enforcement Phase 2 — Implementation Plan v1.0
**THERMOPAC QMS**
**Prepared:** 09 May 2026
**Status:** AWAITING APPROVAL — no implementation until approved

---

## Scope

Phase 2 covers exactly two deliverables:

1. **Layer 4 route consumption gate** — add the enforcement gate in `attendance-routes.ts` that acts on `auditResult.blocked = true` by rejecting the check-in and rolling back the saved record.
2. **Controlled enforcement activation protocol** — the exact sequence to enable `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` only after the gate is verified.

**Explicitly out of scope for Phase 2:**
- Layer 1 (TOTP) end-to-end testing — separate enablement decision
- Layer 2 (device trust) end-to-end testing — separate enablement decision
- Layer 5 frontend re-auth UI walkthrough — separate verification activity
- Any changes to `payroll-salary-core.ts` — permanently zero-diff
- Any `shared/schema.ts` or `drizzle.config.ts` changes
- Any `client/` changes
- Any new feature flags

---

## Pre-Condition (Non-Negotiable)

**`SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` must remain `false` at all times during Phase 2 implementation and testing until P2-ACT is explicitly approved.**

The service-level `blocked` field is already correctly computed (`blocked = enforcing && BLOCKING_OUTCOMES.has(outcome)`). With the flag false, `blocked` is always false — the new route gate is a no-op until the flag is flipped. This means the route gate can be safely deployed before any enforcement decision is made.

---

## Architectural Analysis — Gate Placement

### Current check-in flow (post-Phase 1)

```
Step 1:  Validate request params
Step 2:  Upsert attendance record → savedRecord (DB write)
Step 3:  Run audit pipeline with savedRecord.id → auditResult (DB write: audit row)
Step 4:  res.json({ success: true, record: savedRecord, attendanceAudit: auditResult })
         ^^ auditResult.blocked is IGNORED here — gap confirmed in Phase 1 closure
```

### Problem

The attendance record is written to the DB (Step 2) before the audit result is available (Step 3). If `blocked = true`, the record already exists. Two architectural options exist:

**Option A — Post-save gate with record rollback (RECOMMENDED)**

```
Step 1:  Validate request params
Step 2:  Upsert attendance record → savedRecord
Step 3:  Run audit pipeline with savedRecord.id → auditResult
Step 4:  [NEW GATE] if auditResult?.blocked:
           → delete savedRecord from DB
           → return 403 { code: 'ATTENDANCE_BLOCKED', ... }
Step 5:  res.json({ success: true, ... })
```

- Audit row is written first (inside pipeline Step 9) with `outcome` and `blocked` values — audit trail is preserved even after record deletion.
- Attendance record is created and immediately deleted within the same request cycle — no persistent blocked record.
- Minimal diff — only 5–7 lines added after the existing `catch (auditErr)` block.

**Option B — Pre-save audit (Rejected for Phase 2)**

- Run a lightweight pre-check before saving, skip record creation if blocked.
- Requires `attendanceRecordId: null` in the audit call — breaks the FK reference in the audit log.
- Requires restructuring the entire check-in flow and adding a second audit-update call to backfill the record ID.
- Higher risk, larger diff, more complex rollback.

**Decision: Option A is the Phase 2 approach.**

---

## File Changes

### Exactly 1 file modified: `server/attendance-routes.ts`

No other files are touched.

#### Change: Add enforcement gate and rollback block

**Location:** Lines 230–241 (post-Phase 1 line numbers) — immediately after the `catch (auditErr)` block, before `res.json`.

**Before (current state):**

```typescript
    } catch (auditErr) {
      console.error('Attendance audit pipeline error (non-fatal):', auditErr);
    }

    res.json({
      success: true,
      message: 'Checked in successfully',
      record: savedRecord,
      locationVerified: isLocationVerified,
      ipVerified: isIpVerified,
      ...(auditResult ? { attendanceAudit: auditResult } : {}),
    });
```

**After (Phase 2 gate):**

```typescript
    } catch (auditErr) {
      console.error('Attendance audit pipeline error (non-fatal):', auditErr);
    }

    // Phase 5 enforcement gate — only active when SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = true.
    // blocked is set by the service layer (attendance-security-service.ts).
    // When enforcing = false, blocked is always false — this gate is a no-op.
    if (auditResult?.blocked) {
      // Roll back the saved record — audit row is already written and preserved.
      try {
        if (savedRecord?.id) {
          await db.delete(attendanceRecords).where(eq(attendanceRecords.id, savedRecord.id));
        }
      } catch (rollbackErr) {
        console.error('Attendance enforcement rollback error:', rollbackErr);
      }
      return res.status(403).json({
        code: 'ATTENDANCE_BLOCKED',
        message: 'Check-in blocked by attendance security policy.',
        reason: auditResult.outcome,
        severity: auditResult.severity,
        auditId: auditResult.auditId,
      });
    }

    res.json({
      success: true,
      message: 'Checked in successfully',
      record: savedRecord,
      locationVerified: isLocationVerified,
      ipVerified: isIpVerified,
      ...(auditResult ? { attendanceAudit: auditResult } : {}),
    });
```

**Required import check:** `db` is already imported. `attendanceRecords` and `eq` must be confirmed present in existing imports — both are used elsewhere in this file so no new imports are expected.

---

## Task Sequence

| Task | Depends On | Action | Flag state |
|---|---|---|---|
| P2-PRE | — | Confirm `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = false` in DB before touching any code | false |
| P2-T1 | P2-PRE | Add enforcement gate + rollback block to `attendance-routes.ts` | false |
| P2-VFY-1 | P2-T1 | Server restarts clean, zero new TS errors, no existing test breakage | false |
| P2-VFY-2 | P2-VFY-1 | End-to-end advisory mode: check-in proceeds normally with `blocked=false` (flag still false) | false |
| P2-VFY-3 | P2-VFY-2 | End-to-end enforcement mode: with flag temporarily true in a test session, check-in with a spoofed/geofence-violating location returns 403 `ATTENDANCE_BLOCKED`, record is not persisted, audit row is written | **true (test only)** |
| P2-VFY-4 | P2-VFY-3 | Set flag back to false, confirm advisory behaviour restored | false |
| P2-ACT | P2-VFY-3 + approval | Controlled production activation — set `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = true` | **true (production)** |

**P2-ACT requires explicit separate approval after P2-VFY-3 is confirmed.**

---

## Verification Criteria

### P2-VFY-1 — Clean restart
- Server starts with zero new log errors
- `npx tsc --noEmit` reports zero new errors in modified file
- Only `server/attendance-routes.ts` in `git diff`

### P2-VFY-2 — Advisory mode (flag = false)
- Normal check-in succeeds: `HTTP 200`, `success: true`
- `attendanceAudit.blocked` = false in response regardless of GPS quality
- Attendance record persists in DB
- No rollback triggered

### P2-VFY-3 — Enforcement mode (flag = true, test session)
- Spoofing/geofence/IP violation check-in returns `HTTP 403`
- Response body: `{ code: 'ATTENDANCE_BLOCKED', reason: 'advisory_spoofing_detected' | 'advisory_outside_geofence' | 'advisory_ip_unverified', auditId: <number> }`
- Attendance record NOT present in DB (rollback confirmed via SQL)
- Audit row present in `attendance_location_audit_log` with correct `outcome` and `blocked = true`
- Normal compliant check-in still returns `HTTP 200` (no false positives)
- `low_accuracy` check-in still returns `HTTP 200` (not a blocking outcome — confirmed)

### P2-VFY-4 — Re-disable (flag = false)
- Normal check-in succeeds again: `HTTP 200`
- Spoofed check-in no longer blocked, `blocked = false` in audit result

---

## Rollback Plan

**Code rollback:** Remove the `if (auditResult?.blocked) { ... }` block (lines added in P2-T1). Route reverts to current Phase 1 state.

**Flag rollback (if P2-ACT has been run):**
```sql
UPDATE epc_migration_feature_flags SET enabled = false
WHERE flag_name = 'SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED';
```
Effect: `blocked` is immediately false on all subsequent requests. Route gate becomes a no-op. No service restart needed.

---

## Constraints (Non-Negotiable)

| Constraint | Rationale |
|---|---|
| `payroll-salary-core.ts` — zero diff | Payroll arithmetic is frozen |
| `shared/schema.ts` — zero diff | No new columns or tables |
| `drizzle.config.ts` — zero diff | Migration config is locked |
| All `client/` files — zero diff | No frontend changes in Phase 2 |
| `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` stays false until P2-VFY-3 confirmed | Premature activation without route gate verification would silently fail (pre-Phase 2) or may block legitimate users if misconfigured |
| P2-ACT is a separate approval gate | Enforcement activation is a production operations decision, not an implementation decision |

---

## Exempt Roles Reminder

From `attendance-security-service.ts` line 54:
```typescript
const EXEMPT_ROLES = ['Superuser', 'GM', 'SM'];
```

These roles return `outcome: 'exempt'` from the pipeline — `blocked` is always false for them regardless of flag state. No route gate change is needed for exempt roles.

---

## Open Items Not in Phase 2 Scope

The following items were deferred at Phase 1 closure and require separate planning decisions:

| Item | Status |
|---|---|
| Layer 1 TOTP_SETUP_REQUIRED end-to-end test | Deferred — requires `SECURITY_2FA_POLICY_ENABLED = true` + enrolled/unenrolled test users |
| Layer 2 DEVICE_NOT_TRUSTED end-to-end test | Deferred — requires `SECURITY_DEVICE_TRUST_ENABLED = true` + device pre-registration |
| Layer 5 re-auth frontend UI walkthrough | Deferred — requires a dedicated UI test session |

---

## Summary

Phase 2 is a single-file, minimal-diff change to close the Layer 4 enforcement gate gap identified in Phase 1 verification closure. The gate is safe to deploy with the enforcement flag false (it becomes a no-op). Enforcement activation is a separate controlled step gated behind P2-VFY-3 confirmation and explicit approval.

**Files to be modified:** `server/attendance-routes.ts` (1 file, ~15 lines added)
**New flags:** None
**Schema changes:** None
**Frontend changes:** None
**Payroll changes:** None
